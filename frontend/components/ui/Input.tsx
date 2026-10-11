import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, className = "", ...props }, ref) => {
        return (
            <div className={`flex flex-col gap-1.5 w-full ${className}`}>
                {label && (
                    <label 
                        htmlFor={props.id || props.name}
                        className="text-sm font-medium text-body ml-1"
                    >
                        {label}
                    </label>
                )}
                <input
                    id={props.id || props.name}
                    ref={ref}
                    className={`
            bg-sunken/50 border border-info/10 rounded-xl px-4 py-3
            text-ink placeholder:text-muted
            focus:outline-none focus:border-info/40 focus:ring-1 focus:ring-info/20
            transition-all duration-300
            ${error ? "border-danger/50 focus:border-danger/50 focus:ring-danger/20" : ""}
          `}
                    {...props}
                />
                {error && <span className="text-xs text-danger ml-1">{error}</span>}
            </div>

        );
    }
);

Input.displayName = "Input";
