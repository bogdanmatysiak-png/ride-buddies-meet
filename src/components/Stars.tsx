import { Star } from "lucide-react";

export function Stars({
  value,
  size = "sm",
  onChange,
}: {
  value: number;
  size?: "sm" | "lg";
  onChange?: (score: number) => void;
}) {
  const dim = size === "lg" ? "h-7 w-7" : "h-4 w-4";
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = value >= n - 0.25;
        const icon = (
          <Star
            className={`${dim} ${filled ? "fill-primary text-primary" : "text-muted-foreground"}`}
          />
        );
        if (!onChange) return <span key={n}>{icon}</span>;
        return (
          <button
            key={n}
            type="button"
            aria-label={`Oceń na ${n}`}
            onClick={() => onChange(n)}
            className="transition-transform hover:scale-110"
          >
            {icon}
          </button>
        );
      })}
    </span>
  );
}