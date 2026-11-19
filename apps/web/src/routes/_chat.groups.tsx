import { createFileRoute } from "@tanstack/react-router";

import { ThreadGroupsPage } from "../components/groups/ThreadGroupsPage";

export const Route = createFileRoute("/_chat/groups")({
  component: ThreadGroupsPage,
});
