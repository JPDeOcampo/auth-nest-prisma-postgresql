import { z } from "zod";

type ZodTreeNode = {
  errors: string[];
  properties?: Record<string, ZodTreeNode>;
};

export const extractFieldErrors = (
  tree: ZodTreeNode,
  prefix = "",
): Record<string, string[]> => {
  const result: Record<string, string[]> = {};

  if (tree.errors.length > 0) {
    const key = prefix || "_form";
    result[key] = tree.errors;
  }

  if (tree.properties) {
    for (const [key, subtree] of Object.entries(tree.properties)) {
      const nested = extractFieldErrors(
        subtree,
        prefix ? `${prefix}.${key}` : key,
      );
      Object.assign(result, nested);
    }
  }

  return result;
};

export const formatZodValidationErrors = (error: z.ZodError) =>
  extractFieldErrors(z.treeifyError(error));
