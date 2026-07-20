import { AppHeader } from "@/components/shell/AppHeader";
import { appHeaderBindings, type AppHeaderBindingSources } from "@/lib/appHeaderBindings";

export type AppHeaderWorkspaceProps = AppHeaderBindingSources;

export function AppHeaderWorkspace(props: AppHeaderWorkspaceProps) {
  return <AppHeader {...appHeaderBindings(props)} />;
}
