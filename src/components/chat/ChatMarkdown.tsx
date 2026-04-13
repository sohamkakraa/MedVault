"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUrl(url: string): string {
  const t = url.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("vbscript:")) return "";
  return t;
}

const assistantComponents: Partial<Components> = {
  a: ({ href, children, ...rest }) => {
    const h = href ? safeUrl(href) : "";
    if (!h || (!/^https?:\/\//i.test(h) && !h.startsWith("/"))) {
      return <span {...rest}>{children}</span>;
    }
    return (
      <a href={h} target="_blank" rel="noopener noreferrer" {...rest}>
        {children}
      </a>
    );
  },
  table: ({ children, ...rest }) => (
    <div className="uma-chat-table-wrap">
      <table {...rest}>{children}</table>
    </div>
  ),
};

type Props = {
  content: string;
  variant: "assistant" | "user";
};

export function ChatMarkdown({ content, variant }: Props) {
  return (
    <div className={variant === "user" ? "uma-chat-md uma-chat-md--user" : "uma-chat-md"}>
      <ReactMarkdown urlTransform={safeUrl} remarkPlugins={[remarkGfm]} components={assistantComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
