import {
  H2,
  H3,
  Lead,
  Steps,
  Step,
  Callout,
  CodeBlock,
  Cards,
  Card,
  Table,
  DocLink,
} from "@/components/docs/primitives";
import { ScanSearch, Brain, Boxes, ListChecks, Gauge } from "lucide-react";

export default function AIGovernance() {
  return (
    <>
      <Lead>
        AI governance gives you an inventory of every AI model your applications
        use, surfaces unsanctioned <strong>“shadow AI”</strong>, and lets you bring
        each system under governance — built entirely from the traffic the{" "}
        <DocLink href="/docs/llm-guard">AI / LLM guard</DocLink> already inspects.
      </Lead>

      <H2 id="how-it-works">How discovery works</H2>
      <p>
        Every LLM call routed through the gateway is recorded with its provider,
        model and the personal data detected in it. The console aggregates those
        records into an <strong>AI inventory</strong>: one row per provider, model
        and calling application. Nothing extra to deploy — if a call goes through
        the gateway, it shows up here.
      </p>
      <Cards>
        <Card title="AI Discovery" icon={ScanSearch}>
          Every model seen in your traffic, with call volume, the personal-data
          types flowing to it, and whether it is registered or shadow AI.
        </Card>
        <Card title="AI Systems" icon={Brain}>
          The inventory of governed AI applications — owner, lifecycle stage and
          EU AI Act risk tier.
        </Card>
        <Card title="Model Catalog" icon={Boxes}>
          The provider models your systems use, linked back to the system that
          owns them.
        </Card>
      </Cards>

      <Callout variant="note" title="Only metadata is stored">
        Discovery never persists prompts or responses. It records the model, the
        PII <em>types</em> detected and counts — never the underlying content.
      </Callout>

      <H2 id="workflow">Your AI governance workflow</H2>
      <p>
        From a model&rsquo;s first sighting to audit-ready evidence, the path is
        the same six steps. Each is covered in detail below.
      </p>
      <Steps>
        <Step title="Route AI calls through the gateway">
          <p>
            Point your AI clients at the gateway (see{" "}
            <DocLink href="/docs/llm-guard">AI / LLM guard</DocLink>). Every call is
            then inventoried automatically — there is nothing else to install.
          </p>
        </Step>
        <Step title="Discover what's running">
          <p>
            Open <strong>AI Discovery</strong> to see every model in use and which
            calls are unsanctioned <strong>shadow AI</strong>.
          </p>
        </Step>
        <Step title="Register legitimate systems">
          <p>Promote shadow usage into a governed <strong>AI system</strong> with an owner.</p>
        </Step>
        <Step title="Assess risk">
          <p>Work each system through the framework checklists in the <strong>Risk Register</strong>.</p>
        </Step>
        <Step title="Approve with oversight">
          <p>
            Sign a system off in <strong>AI Systems → Manage</strong>, recording a
            human-oversight attestation.
          </p>
        </Step>
        <Step title="Evidence it">
          <p>Generate an <strong>AI Governance Report</strong> for boards and auditors.</p>
        </Step>
      </Steps>

      <H2 id="shadow-ai">Shadow AI vs registered</H2>
      <p>
        A model is <strong>registered</strong> once it belongs to an AI system in
        your catalog. Anything else your applications call is flagged as{" "}
        <strong>shadow AI</strong> — AI usage nobody has reviewed. The goal is to
        drive the shadow-AI count to zero by registering each legitimate system and
        investigating the rest.
      </p>

      <H2 id="attribution">Attribute calls to an app and user</H2>
      <p>
        Model and provider are detected automatically. To attribute a call to a
        specific application or caller, set two optional headers when you send it
        through the gateway:
      </p>
      <Table
        head={["Header", "Purpose"]}
        rows={[
          ["X-AI-App", "The application or AI system making the call (e.g. support-copilot)."],
          ["X-AI-User", "The end user or service account on whose behalf the call is made."],
        ]}
      />
      <CodeBlock
        lang="bash"
        code={`curl https://gateway.datasentinel.io/v1/chat/completions \\
  -H "X-API-Key: ds_live_••••••••" \\
  -H "X-Upstream-URL: https://api.openai.com/v1/chat/completions" \\
  -H "X-AI-App: support-copilot" \\
  -H "X-AI-User: agent-42" \\
  -H "Content-Type: application/json" \\
  -d '{ "model": "gpt-4o", "messages": [{ "role": "user", "content": "..." }] }'`}
      />

      <H2 id="register">Bring shadow AI under governance</H2>
      <Steps>
        <Step title="Open AI Discovery">
          <p>
            Go to <strong>AI Governance → AI Discovery</strong>. Shadow models are
            flagged in red, with the personal data flowing to each.
          </p>
        </Step>
        <Step title="Register the system">
          <p>
            Click <strong>Register</strong> on a row to create a governed AI system
            and add its model to the catalog. Give it a name and owner.
          </p>
        </Step>
        <Step title="Review and classify">
          <p>
            The new system starts <em>under review</em>. Open{" "}
            <strong>AI Systems</strong> to set its EU AI Act risk tier and move it
            through your lifecycle stages to <em>approved</em>.
          </p>
        </Step>
      </Steps>

      <H3 id="lifecycle">Lifecycle stages</H3>
      <Table
        head={["Stage", "Meaning"]}
        rows={[
          ["Discovered", "Seen in traffic, not yet triaged."],
          ["Proposed", "Put forward for adoption."],
          ["Under review", "Being assessed (the default after registering shadow AI)."],
          ["Approved", "Reviewed and sanctioned for use."],
          ["Retired", "No longer in use."],
        ]}
      />

      <H2 id="usage-cost">Usage &amp; cost</H2>
      <p>
        Every LLM call also records the provider&rsquo;s reported{" "}
        <strong>token usage</strong>. The <strong>Usage &amp; Cost</strong> page
        rolls this up into spend by model and by application, with a daily trend —
        so you can see what your AI is costing without wiring up a separate FinOps
        tool.
      </p>
      <ul>
        <li>
          <strong>By model</strong> — calls, tokens and estimated cost for each
          model in use.
        </li>
        <li>
          <strong>By application</strong> — the same, attributed via the{" "}
          <code>X-AI-App</code> header so you can charge spend back to a team.
        </li>
      </ul>
      <Callout variant="note" title="Costs are estimates">
        Cost is derived from public list prices per model and is shown as an{" "}
        <em>estimate</em> — it may differ from your provider&rsquo;s billed amount.
        Unrecognised models fall back to a generic rate.
      </Callout>

      <H2 id="risk-register">Risk register &amp; assessments</H2>
      <p>
        The <strong>Risk Register</strong> scores each AI system&rsquo;s{" "}
        <strong>residual risk</strong> — its inherent risk reduced by the controls
        you have in place. Assess a system against the frameworks that matter to
        you and the register updates automatically.
      </p>
      <Cards>
        <Card title="Frameworks" icon={ListChecks}>
          NIST AI RMF, EU AI Act (Art. 8–17, 50), ISO/IEC 42001 and DPDP — each as
          a checklist of controls you mark met, partial, not met or N/A.
        </Card>
        <Card title="Residual risk" icon={Gauge}>
          Inherent risk (from the EU AI Act tier) is reduced by your control
          readiness to give a residual score per system.
        </Card>
      </Cards>

      <H3 id="assess-a-system">Assess a system step by step</H3>
      <Steps>
        <Step title="Open the Risk Register">
          <p>
            Go to <strong>AI Governance → Risk Register</strong> and click{" "}
            <strong>Assess</strong> on the system you want to evaluate.
          </p>
        </Step>
        <Step title="Pick a framework">
          <p>
            Choose <strong>NIST AI RMF</strong>, <strong>EU AI Act</strong>,{" "}
            <strong>ISO 42001</strong> or <strong>DPDP</strong> from the framework
            selector. You can assess against several.
          </p>
        </Step>
        <Step title="Mark each control">
          <p>
            For every control set <strong>Met</strong>, <strong>Partial</strong>,{" "}
            <strong>Not met</strong> or <strong>N/A</strong>, adding a short note as
            evidence where useful. The readiness percentage updates as you go.
          </p>
        </Step>
        <Step title="Save the assessment">
          <p>
            Set the status to <em>Completed</em> and save. The system&rsquo;s
            residual risk and gap count recompute immediately in the register.
          </p>
        </Step>
      </Steps>
      <Table
        head={["Term", "Meaning"]}
        rows={[
          ["Inherent risk", "Baseline risk from the system's EU AI Act tier, before controls."],
          ["Readiness", "Share of applicable controls met across the frameworks you assessed."],
          ["Residual risk", "Inherent risk after applying that readiness — what's left to manage."],
          ["Gaps", "Applicable controls not yet fully met."],
        ]}
      />
      <Callout variant="note" title="Govern, don't re-build">
        Assessments let you <em>record and verify</em> that controls — including
        guardrails, human oversight and security — exist for an AI system. The
        controls themselves are implemented by the system&rsquo;s owner; DataSentinel
        governs and evidences them.
      </Callout>

      <H2 id="lifecycle">Lifecycle &amp; oversight</H2>
      <p>
        Each AI system moves through a governed lifecycle with a full sign-off
        trail. From <strong>AI Systems</strong>, open <strong>Manage</strong> to act
        on a system.
      </p>
      <Table
        head={["Action", "From → to"]}
        rows={[
          ["Submit for review", "Discovered / Proposed → Under review"],
          ["Approve", "Under review → Approved (requires an oversight attestation)"],
          ["Mark reviewed", "Approved → Approved (periodic re-attestation)"],
          ["Reopen", "Approved / Retired → Under review"],
          ["Retire", "Any → Retired"],
        ]}
      />

      <H3 id="approve-a-system">Approve a system for production</H3>
      <Steps>
        <Step title="Open Manage">
          <p>
            In <strong>AI Systems</strong>, click <strong>Manage</strong> on the
            system. It should be <em>Under review</em> (submit it for review first
            if not).
          </p>
        </Step>
        <Step title="Write the oversight attestation">
          <p>
            In the attestation box, confirm that human oversight, data governance
            and the required controls are in place for the system.
          </p>
        </Step>
        <Step title="Approve">
          <p>
            Click <strong>Approve</strong>. The system moves to <em>Approved</em>, a
            review date is set, and the sign-off is logged immutably in the
            attestation history.
          </p>
        </Step>
      </Steps>

      <Callout variant="note" title="Every transition is evidenced">
        Approvals and reviews require a written attestation and are recorded
        immutably with who acted and when — your human-oversight evidence for EU AI
        Act Art. 14 and NIST GOVERN.
      </Callout>

      <p>
        Generate an <strong>AI Governance Report</strong> from{" "}
        <DocLink href="/docs/reports">Reports</DocLink> for a board- and
        auditor-ready document of the AI inventory, framework risk posture and
        oversight sign-offs.
      </p>

      <Callout variant="tip" title="Tip">
        Route all AI traffic through the gateway so discovery is complete. Any model
        that bypasses it won’t appear — which is itself the gap to close.
      </Callout>
    </>
  );
}
