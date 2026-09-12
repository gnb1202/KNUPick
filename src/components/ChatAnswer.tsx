/** Render server-authored source quotes as React text. Source HTML and Markdown
 * links stay inert; escaping used in exported Markdown is removed for display. */
export function ChatAnswer({ content }: { content: string }) {
  const unescape = (s: string) => s.replace(/\\([\\`*_{}\[\]()<>#+.!|~])/g, '$1');
  return <div data-chat-answer>
    {content.split(/\n\n+/).map((block, index) => {
      const lines = block.split('\n');
      if (lines.every(line => line.startsWith('> '))) return (
        <blockquote key={index} style={{ margin:'10px 0',paddingLeft:12,borderLeft:'3px solid var(--border-soft)',
          whiteSpace:'pre-wrap',fontSize:13 }}>
          {unescape(lines.map(line=>line.slice(2)).join('\n'))}
        </blockquote>
      );
      return <p key={index} style={{margin:index?'12px 0 0':0,whiteSpace:'pre-wrap'}}>{unescape(block)}</p>;
    })}
  </div>;
}
