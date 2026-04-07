export async function shared_echo(ctx, input) {
  return {
    message: `beta:${input.message}`,
    nodeId: ctx.calleeNodeId,
  };
}

export async function call_alpha(ctx, input) {
  const result = await ctx.fabric.invoke({
    provide: "shared_echo",
    target: { nodeId: "pi-alpha" },
    input,
  });

  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return {
    ...result.output,
    via: ctx.calleeNodeId,
  };
}

export async function bounce_to_alpha(ctx, input) {
  if (input.remaining <= 0) {
    return {
      doneBy: ctx.calleeNodeId,
      remaining: input.remaining,
    };
  }

  const result = await ctx.fabric.invoke({
    provide: "bounce_to_beta",
    target: { nodeId: "pi-alpha" },
    input: { remaining: input.remaining - 1 },
  });

  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.details = result.error.details;
    throw error;
  }

  return result.output;
}
