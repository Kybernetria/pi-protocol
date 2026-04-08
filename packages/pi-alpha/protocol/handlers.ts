export async function shared_echo(ctx, input) {
  return {
    message: `alpha:${input.message}`,
    nodeId: ctx.calleeNodeId,
  };
}

export async function bad_output(ctx, input) {
  return {
    wrong: `not-valid:${input.message}`,
  };
}

export async function bounce_to_beta(ctx, input) {
  if (input.remaining <= 0) {
    return {
      doneBy: ctx.calleeNodeId,
      remaining: input.remaining,
    };
  }

  const result = await ctx.delegate.invoke({
    provide: "bounce_to_alpha",
    target: { nodeId: "pi-beta" },
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
