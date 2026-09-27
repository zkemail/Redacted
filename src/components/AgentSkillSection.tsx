import { useState } from "react";

const INSTALL = "curl -fsSL https://redacted.zk.email/skills/redacted-email-proof/install.sh | sh";
const EXAMPLE = [
  'R="node ~/.redacted-prover/redacted.mjs"',
  "$R inspect email.eml",
  '$R prove email.eml --only-headers from,subject,date --hide-body --reveal "your offer" --publish',
  '$R verify "https://redacted.zk.email/verify?id=…"',
].join("\n");

const CopyBlock = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative w-full min-w-0">
      <pre className="bg-darker text-white text-xs sm:text-sm p-4 pr-16 overflow-x-auto whitespace-pre font-mono">
        {text}
      </pre>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="absolute top-2 right-2 border border-white/40 text-white text-xs px-2 py-1 hover:bg-white/10"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            },
            () => undefined,
          );
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
};

/**
 * Tells visiting AI agents (and their humans) that an installable skill exists for proving
 * emails locally from the command line. The same content is mirrored as plain HTML in
 * index.html (#agent-skill-static) so agents that fetch the page without running JS find it too.
 */
const AgentSkillSection = () => (
  <section id="agents" className="flex flex-col p-6 gap-6 w-full min-w-0" aria-labelledby="agents-heading">
    <div className="flex flex-col gap-2">
      <div className="border border-light px-3 py-1 text-sm inline-block mb-2 w-max">
        For AI agents
      </div>
      <h2 id="agents-heading" className="text-2xl lg:text-4xl font-heading">
        Agents can prove emails locally too
      </h2>
      <p className="font-light font-body text-base leading-5 tracking-0 text-dark">
        If you are an agent with access to someone's email (a Gmail MCP, IMAP, or a browser), install
        the <strong className="font-medium">redacted-email-proof</strong> skill. It downloads the same
        circuits and prover this site uses, generates the proof on your machine, and returns a{" "}
        <code>redacted.zk.email/verify</code> link. The raw email is never uploaded; only the proof
        and the parts you chose to reveal are.
      </p>
    </div>
    <CopyBlock text={INSTALL} label="install command" />
    <CopyBlock text={EXAMPLE} label="example commands" />
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      <a className="underline" href="/skills/redacted-email-proof/SKILL.md">
        SKILL.md (full instructions)
      </a>
      <a className="underline" href="/llms.txt">
        llms.txt
      </a>
      <a
        className="underline"
        href="https://github.com/zkemail/Redacted/tree/main/skills/redacted-email-proof"
        target="_blank"
        rel="noreferrer"
      >
        Source on GitHub
      </a>
    </div>
  </section>
);

export default AgentSkillSection;
