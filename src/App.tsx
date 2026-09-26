import { AppProvider } from "./lib/store";
import { MenuProvider } from "./features/menus/menus";
import { Shell } from "./app/Shell";

export default function App() {
  return (
    <AppProvider>
      <MenuProvider>
        <Shell />
      </MenuProvider>
    </AppProvider>
  );
}
