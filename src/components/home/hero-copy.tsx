import { int } from "../auditor/format";
import { SAMPLE_REPORT_ID, sampleReport } from "./sample-report";

export async function HeroCopy() {
  const { report } = await sampleReport();
  return (
    <div>
      <h1 className="max-w-[16ch] text-4xl font-semibold leading-[1.05] tracking-[-0.035em] sm:text-5xl lg:text-[3.5rem]">
        Were the resolutions you paid for real?
      </h1>
      <p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-ink-2">
        Drop your support export and see which billed AI resolutions failed a stricter test. Your file
        never leaves your browser.
      </p>
      <p className="mt-6 max-w-[42ch] border-l-2 border-accent pl-4 leading-relaxed">
        On the built-in sample, <span className="num font-semibold">{int(report.phantom)}</span> of{" "}
        <span className="num font-semibold">{int(report.billedJudged)}</span> billed resolutions failed the
        strict test.{" "}
        <a
          href={`#${SAMPLE_REPORT_ID}`}
          className="whitespace-nowrap font-medium underline decoration-line-strong underline-offset-4 hover:decoration-ink"
        >
          See the report ↓
        </a>
      </p>
    </div>
  );
}
