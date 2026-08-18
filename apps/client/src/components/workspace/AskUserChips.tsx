export function AskUserChips({
  question,
  options,
  answered,
  disabled = false,
  onAnswer,
}: {
  question: string;
  options: string[];
  answered?: string | null;
  disabled?: boolean;
  onAnswer?: (answer: string) => void;
}) {
  const locked = disabled || answered != null;

  return (
    <div className="space-y-2">
      <p className="font-medium text-gray-900 text-sm leading-relaxed">{question}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            disabled={locked}
            onClick={() => onAnswer?.(option)}
            className={`px-2.5 py-1 text-xs rounded-full font-medium transition border ${
              answered === option
                ? "bg-blue-600 border-blue-600 text-white"
                : locked
                  ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 cursor-pointer"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
