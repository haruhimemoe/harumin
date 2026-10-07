/**
 * @file src/commands/top.ts
 * @desc /top: a player's top 100, sorted and filtered, five a page with buttons. The list is
 *       fetched once and kept two minutes, so paging costs no osu! calls.
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Tue Oct 6, 2026
 */

import type { Ruleset } from "@haruhimemoe/harumin-config";
import type { OsuScore, OsuUserProfile } from "@haruhimemoe/osu";
import { formatMods } from "@haruhimemoe/osu/format";
import { userUrl } from "@haruhimemoe/osu/shapes";
import { type ButtonInteraction, SlashCommandBuilder } from "discord.js";
import { scoreListEmbed } from "../embeds/osu.ts";
import { createTtlCache } from "../services/cache.ts";
import type { Command, Services } from "../types.ts";
import { RULESET_NAMES } from "../utils/format.ts";
import { parseModsInput } from "../utils/mods.ts";
import { arrangeScores, pageOf, TOP_SORTS, type TopSort } from "../utils/scores.ts";
import { addPlayerOptions, fail, loadPlayer, pageButtons } from "./shared.ts";

type TopList = { profile: OsuUserProfile; scores: OsuScore[] };
const lists = createTtlCache<string, TopList>(120_000, 500);

const SORT_LABELS: Readonly<Record<TopSort, string>> = {
  pp: "pp",
  recent: "newest",
  accuracy: "accuracy",
  combo: "combo",
  score: "score",
  misses: "fewest misses",
};

type View = {
  osuId: number;
  ruleset: Ruleset;
  sort: TopSort;
  mods: string;
  reverse: boolean;
  page: number;
};

const render = (list: TopList, view: View) => {
  const filter = view.mods === "-" ? null : parseModsInput(view.mods);
  const arranged = arrangeScores(list.scores, {
    sort: view.sort,
    mods: filter,
    reverse: view.reverse,
  });
  const { items, page, pages } = pageOf(arranged, view.page);
  const note = [
    view.sort !== "pp" || view.reverse
      ? `Sorted by ${SORT_LABELS[view.sort]}${view.reverse ? ", reversed" : ""}`
      : "",
    filter ? `${formatMods(filter)} only · ${arranged.length} of ${list.scores.length}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    embeds: [
      scoreListEmbed(items, {
        title: `Top ${RULESET_NAMES[view.ruleset]} plays`,
        url: `${userUrl(view.osuId)}/${view.ruleset}`,
        player: list.profile,
        page,
        pages,
        note: note || undefined,
      }),
    ],
    components: pageButtons(
      `top:${view.osuId}:${view.ruleset}:${view.sort}:${view.mods}:${view.reverse ? 1 : 0}`,
      page,
      pages,
    ),
  };
};

const loadList = async (
  s: Services,
  profile: OsuUserProfile,
  ruleset: Ruleset,
): Promise<TopList> => {
  const key = `${profile.osuId}:${ruleset}`;
  const cached = lists.get(key);
  if (cached) return cached;
  const scores = await s.osu.getUserScores(profile.osuId, "best", { ruleset, limit: 100 });
  const list = { profile, scores };
  lists.set(key, list);
  return list;
};

export const top: Command = {
  category: "osu",
  data: addPlayerOptions(
    new SlashCommandBuilder().setName("top").setDescription("A player's top plays"),
  )
    .addStringOption((option) =>
      option
        .setName("sort")
        .setDescription("Order (default pp)")
        .addChoices(...TOP_SORTS.map((value) => ({ name: SORT_LABELS[value], value }))),
    )
    .addStringOption((option) =>
      option
        .setName("mods")
        .setDescription("Only plays with these mods, e.g. HDDT, or NM")
        .setMaxLength(24),
    )
    .addBooleanOption((option) => option.setName("reverse").setDescription("Reverse the order"))
    .toJSON(),
  async execute(interaction, s) {
    const modsInput = interaction.options.getString("mods");
    if (modsInput && parseModsInput(modsInput) === null) {
      await fail(interaction, `\`${modsInput}\` isn't a mod combination. Try \`HDDT\` or \`NM\`.`);
      return;
    }
    await interaction.deferReply();
    const loaded = await loadPlayer(interaction, s);
    if (!loaded) return;
    const list = await loadList(s, loaded.profile, loaded.ruleset);
    const mods = modsInput
      ? (parseModsInput(modsInput) ?? []).map((m) => m.acronym).join("") || "NM"
      : "-";
    await interaction.editReply(
      render(list, {
        osuId: loaded.profile.osuId,
        ruleset: loaded.ruleset,
        sort: (interaction.options.getString("sort") as TopSort | null) ?? "pp",
        mods,
        reverse: interaction.options.getBoolean("reverse") ?? false,
        page: 1,
      }),
    );
  },
  async button(interaction: ButtonInteraction, s, [osuId, ruleset, sort, mods, reverse, page]) {
    const view: View = {
      osuId: Number(osuId),
      ruleset: ruleset as Ruleset,
      sort: (TOP_SORTS as readonly string[]).includes(sort ?? "") ? (sort as TopSort) : "pp",
      mods: mods ?? "-",
      reverse: reverse === "1",
      page: Number(page),
    };
    await interaction.deferUpdate();
    let list = lists.get(`${view.osuId}:${view.ruleset}`);
    if (!list) {
      const profile = await s.osu.getUserProfile(view.osuId, { ruleset: view.ruleset });
      if (!profile) return;
      list = await loadList(s, profile, view.ruleset);
    }
    await interaction.editReply(render(list, view));
  },
};
