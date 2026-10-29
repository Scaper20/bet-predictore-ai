/** Ask KiqStat's own Anthropic key when set (so its spend shows separately in the console), else the shared one. */
export const askApiKey = (): string | undefined => process.env.ANTHROPIC_ASK_API_KEY?.trim() || process.env.ANTHROPIC_API_KEY?.trim() || undefined;

/** Whether Claude is configured: Ask KiqStat and the admin status panel depend on it. */
export const aiEnabled = (): boolean => Boolean(askApiKey());
