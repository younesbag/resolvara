import { ConfirmView, ErrorView, FetchView, WorkView } from "./progress";
import { Intro } from "./intro";
import { ResultsView } from "./results-view";
import { useApp } from "./use-app";
import type { ZafClient } from "../zaf";

export function App({ client }: { client: ZafClient | null }) {
  const api = useApp(client);
  const { stage } = api.state;
  return (
    <main className="zd-page">
      {stage === "intro" && <Intro api={api} />}
      {(stage === "fetching" || stage === "paused") && <FetchView api={api} />}
      {stage === "reading" && <WorkView api={api} />}
      {stage === "confirm" && <ConfirmView api={api} />}
      {stage === "results" && <ResultsView api={api} />}
      {stage === "error" && <ErrorView api={api} />}
    </main>
  );
}
