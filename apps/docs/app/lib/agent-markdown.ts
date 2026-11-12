/** Processed MDX uses site-relative paths; Agent resources need public docs URLs. */
export function agentMarkdown(markdown: string) {
  return markdown
    .replace(/<AgentRoutes\s*\/>/g, "")
    .replace(/(\]\()\/(development|user)(?=[/)#])/g, "$1/docs/$2")
    .trim();
}
