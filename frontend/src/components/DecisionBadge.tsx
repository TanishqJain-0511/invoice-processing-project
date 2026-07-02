interface Props {
  decision: "approve" | "flag" | "reject";
  size?: "sm" | "lg";
}

const styles = {
  approve: "bg-green-100 text-green-800 border-green-200",
  flag: "bg-amber-100 text-amber-800 border-amber-200",
  reject: "bg-red-100 text-red-800 border-red-200",
};

export default function DecisionBadge({ decision, size = "sm" }: Props) {
  return (
    <span
      className={`inline-flex items-center border font-semibold rounded-full ${styles[decision]} ${
        size === "lg"
          ? "px-4 py-1.5 text-base"
          : "px-3 py-0.5 text-sm"
      }`}
    >
      {decision.toUpperCase()}
    </span>
  );
}
