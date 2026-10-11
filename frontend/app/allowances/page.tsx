import type { Metadata } from "next";
import { AllowancesView } from "./AllowancesView";

export const metadata: Metadata = {
  title: "Allowances | SoroPad",
  description:
    "Review and revoke the standing permissions you have granted for other accounts to spend your tokens.",
};

export default function AllowancesRoute() {
  return <AllowancesView />;
}
