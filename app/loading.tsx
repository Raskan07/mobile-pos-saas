import { IOSSpinner } from "@/components/ui/IOSSpinner";

export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading page"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#09080d]/60 backdrop-blur-md"
    >
      <div className="flex flex-col items-center justify-center p-6 rounded-2xl bg-[#12101a]/80 border border-white/[0.08] shadow-2xl">
        <IOSSpinner size={34} color="rgba(255, 255, 255, 0.9)" />
      </div>
    </div>
  );
}
