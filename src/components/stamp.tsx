import type { Verdict } from "@/engine";
import { VERDICT_LABEL } from "./auditor/meta";

const CLASS: Record<Verdict, string> = {
  strict_pass: "stamp stamp-pass",
  confirmed_pass: "stamp stamp-pass",
  phantom: "stamp stamp-phantom",
  pending_window: "stamp stamp-muted",
  unverifiable: "stamp stamp-muted",
};

export function Stamp({ verdict }: { verdict: Verdict }) {
  return <span className={CLASS[verdict]}>{VERDICT_LABEL[verdict]}</span>;
}
