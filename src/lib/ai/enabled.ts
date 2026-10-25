/** Whether Claude is configured: Ask KiqStat and the admin status panel depend on it. */
export const aiEnabled = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY?.trim());
