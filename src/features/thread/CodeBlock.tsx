import { Fragment, memo, useMemo } from "react";
import { Icon } from "../../components/Icon";
import { useActions } from "../../lib/store";
import { highlight, type TokenKind } from "./highlight";
import { copyText } from "./utils";

const KIND_CLASS: Record<TokenKind, string> = {
  plain: "thread-syn-plain",
  comment: "thread-syn-comment",
  keyword: "thread-syn-keyword",
  string: "thread-syn-string",
  literal: "thread-syn-literal",
  variable: "thread-syn-variable",
  attribute: "thread-syn-attribute",
  name: "thread-syn-name",
};

export const CodeBlock = memo(function CodeBlock({ language, code, path }: { language: string; code: string; path?: string }) {
  const actions = useActions();
  const tokens = useMemo(() => highlight(code, language), [code, language]);

  const copy = () => {
    void copyText(code).then((ok) => actions.pushToast(ok ? "Copied code" : "Copy failed"));
  };

  return (
    <div className="thread-codeblock">
      {path ? (
        <div className="thread-codeblock-head">
          <span className="thread-codeblock-path truncate">{path}</span>
          <button type="button" className="thread-copy-btn focus-ring" aria-label="Copy code" onClick={copy}>
            <Icon name="copy" size={14} />
          </button>
        </div>
      ) : (
        <button type="button" className="thread-copy-btn thread-codeblock-float focus-ring" aria-label="Copy code" onClick={copy}>
          <Icon name="copy" size={14} />
        </button>
      )}
      <pre className="thread-codeblock-body">
        <code>
          {tokens.map((token, index) => (
            <Fragment key={index}>
              <span className={KIND_CLASS[token.kind]}>{token.text}</span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
});
