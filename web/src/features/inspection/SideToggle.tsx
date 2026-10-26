import { useViewState } from "../../app/viewState";
import type { BridgeSide } from "../../data/types";

const OPTIONS: { value: BridgeSide; label: string }[] = [
  { value: "A", label: "Side A (South)" },
  { value: "C", label: "Side C (North)" },
];

// Switches which arch's side elevation is shown. Both views share the same x
// direction (Brussels on the left) so they are directly comparable.
export default function SideToggle() {
  const { selectedSide, setSelectedSide } = useViewState();

  return (
    <div className="side-toggle-group" role="group" aria-label="Bridge side">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={"plan-btn" + (o.value === selectedSide ? " active" : "")}
          onClick={() => setSelectedSide(o.value)}
          aria-pressed={o.value === selectedSide}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
