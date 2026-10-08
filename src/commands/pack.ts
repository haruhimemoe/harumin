/**
 * @file src/commands/pack.ts
 * @desc /pack: a pack's card from a packs.haruhime.moe link, slug or pack key (the channel's last
 *       pack when none is given).
 * @author David @dvhsh (https://dvh.sh)
 * @created Tue Oct 6, 2026
 * @modified Thu Oct 8, 2026
 */

import { extractPackKey } from "@haruhimemoe/pool";
import { SlashCommandBuilder } from "discord.js";
import { refFromUrl } from "../links/index.ts";
import type { Command } from "../types.ts";
import { type FoundPool, findPack, findPackKey, renderPoolCard } from "../views/tools.ts";
import { fail } from "./shared.ts";

const SLUG = /^[A-Za-z0-9_-]{10}$/;

export const pack: Command = {
  category: "haruhime",
  data: new SlashCommandBuilder()
    .setName("pack")
    .setDescription("A pack from packs.haruhime.moe")
    .addStringOption((option) =>
      option.setName("pack").setDescription("Pack link, code or pack key").setMaxLength(4000),
    )
    .toJSON(),
  async execute(interaction, s) {
    const input = interaction.options.getString("pack")?.trim();
    let slug: string | null = null;
    let key: string | null = null;
    if (input) {
      key = extractPackKey(input);
      if (!key) {
        if (SLUG.test(input)) slug = input;
        else {
          try {
            const ref = refFromUrl(new URL(input));
            if (ref?.key === "pack") slug = ref.slug;
          } catch {
            // Not a link.
          }
        }
      }
      if (!key && !slug) {
        await fail(interaction, "That isn't a pack link, code or key.");
        return;
      }
    } else {
      slug = s.context.get(interaction.channelId, "pack")?.slug ?? null;
      if (!slug) {
        await fail(interaction, "Which pack? Pass `pack`, or link one here first.");
        return;
      }
    }
    await interaction.deferReply();
    const found: FoundPool | null = key ? findPackKey(key) : await findPack(s, slug as string);
    if (!found) {
      await fail(
        interaction,
        key
          ? "That pack key doesn't decode. Copy it again from packs."
          : "No public pack with that code.",
      );
      return;
    }
    if (slug) s.context.set(interaction.channelId, { key: "pack", slug });
    await interaction.editReply(await renderPoolCard(s, found));
  },
};
