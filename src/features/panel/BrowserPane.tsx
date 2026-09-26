import type { JSX } from "react";
import { Icon } from "../../components/Icon";
import { useActions } from "../../lib/store";

const NAV_TOAST = "Browser navigation is not wired in this build";

export function BrowserPane(): JSX.Element {
  const actions = useActions();
  return (
    <div className="panel-pane panel-browser">
      <div className="panel-browser-toolbar">
        <button
          type="button"
          className="panel-icon-btn focus-ring"
          aria-label="Go back"
          onClick={() => actions.pushToast(NAV_TOAST)}
        >
          <Icon name="arrow-left" size={16} />
        </button>
        <button
          type="button"
          className="panel-icon-btn focus-ring"
          aria-label="Go forward"
          onClick={() => actions.pushToast(NAV_TOAST)}
        >
          <Icon name="arrow-right" size={16} />
        </button>
        <button
          type="button"
          className="panel-icon-btn focus-ring"
          aria-label="Reload"
          onClick={() => actions.pushToast(NAV_TOAST)}
        >
          <Icon name="history" size={16} />
        </button>
        <input
          className="panel-browser-address"
          value="http://localhost:5173/"
          aria-label="Address"
          readOnly
          spellCheck={false}
        />
      </div>
      <div className="panel-browser-body">
        <span className="panel-browser-glyph" aria-hidden="true">
          <Icon name="globe" size={20} />
        </span>
        <p className="panel-browser-title text-size-chat">Browser preview is unavailable offline</p>
        <p className="panel-browser-note text-size-chat">
          The in-app browser needs a reachable preview server. Start the dev server and reload this panel to point it at
          your local page.
        </p>
      </div>
    </div>
  );
}
