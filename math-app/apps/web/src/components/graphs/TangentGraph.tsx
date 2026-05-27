import type { GraphConfig } from "@mauth-studio/shared";

import { FunctionGraph } from "@/components/graphs/FunctionGraph";

export function TangentGraph({ graphConfig }: { graphConfig?: GraphConfig | null }) {
  return <FunctionGraph graphConfig={graphConfig} />;
}
