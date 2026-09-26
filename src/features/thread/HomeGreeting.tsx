import { useApp } from "../../lib/store";
import "./greeting.css";

export function HomeGreeting() {
  const { settings } = useApp();
  const name = settings.userName?.trim();
  return (
    <div className="greet">
      <h1 className="greet-title">
        {name ? `What are we working on today, ${name}?` : "What are we working on today?"}
      </h1>
    </div>
  );
}
