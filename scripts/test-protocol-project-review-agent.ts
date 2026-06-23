import assert from "node:assert/strict";
import { ensureProtocolFabric } from "../packages/pi-protocol-minimal/index.ts";
import projectReviewAgentExtension from "../packages/pi-protocol-project-review-agent/extension.ts";

projectReviewAgentExtension({} as never);

const fabric = ensureProtocolFabric();
const registry = fabric.registry();

assert.ok(registry.nodes.some((node) => node.nodeId === "project_review_agent"));
assert.ok(registry.provides.some((provide) => provide.globalId === "project_review_agent.review_task"));

const node = fabric.describeNode("project_review_agent");
assert.ok(node);
assert.equal(node.protocolVersion, "0.2.0");
assert.equal(node.packageId, "@kyvernitria/pi-protocol-project-review-agent");
assert.equal(node.version, "0.0.0-prototype");
assert.equal(node.ui?.agentColors?.root_agent, "accent");
assert.equal(node.ui?.agentColors?.project_reviewer, "success");
assert.equal(node.ui?.agentColors?.["pi-chat"], "accent");
assert.equal(node.agents?.project_reviewer.description, "Concise project/task reviewer for protocol certification smoke tests.");
assert.match(node.agents?.project_reviewer.systemPrompt?.text ?? "", /Review the provided project task concisely/);
assert.equal(node.agents?.project_reviewer.systemPrompt?.mode, "append");

const provide = fabric.describeProvide("project_review_agent", "review_task");
assert.ok(provide);
assert.equal(provide.globalId, "project_review_agent.review_task");
assert.equal(provide.execution.type, "agent");
if (provide.execution.type === "agent") {
  assert.equal(provide.execution.agent, "project_reviewer");
}
assert.deepEqual(provide.inputSchema, { type: "string" });
assert.deepEqual(provide.outputSchema, { type: "string" });

console.log("protocol project review agent manifest registration works");
