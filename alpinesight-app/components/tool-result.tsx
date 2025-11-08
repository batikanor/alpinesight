import { CheckCircle2, MapPin, X, Satellite } from "lucide-react";

interface ToolResultProps {
  result?: {
    status?: string;
    action?: string;
    location?: string;
    marker_color?: string;
    message?: string;
    latitude?: number;
    longitude?: number;
  };
}

export function ToolResult({ result }: ToolResultProps) {
  if (!result || !result.action) return null;

  const getIcon = () => {
    switch (result.action) {
      case "displayed_location":
        return <MapPin className="w-4 h-4" />;
      case "closed_globe":
        return <X className="w-4 h-4" />;
      case "show_satellite_timeline":
        return <Satellite className="w-4 h-4" />;
      default:
        return <CheckCircle2 className="w-4 h-4" />;
    }
  };

  const getTitle = () => {
    switch (result.action) {
      case "displayed_location":
        return "Location Displayed";
      case "closed_globe":
        return "Globe Closed";
      case "show_satellite_timeline":
        return "Satellite Timeline Loading";
      default:
        return "Action Complete";
    }
  };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 bg-muted/30 text-sm">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0 mt-0.5">
        {getIcon()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground mb-0.5">{getTitle()}</div>
        {result.location && (
          <div className="text-muted-foreground">
            📍 {result.location}
            {result.marker_color && (
              <span className="ml-2">
                • <span style={{ color: result.marker_color }}>●</span>{" "}
                {result.marker_color} marker
              </span>
            )}
          </div>
        )}
        {result.message && !result.location && (
          <div className="text-muted-foreground">{result.message}</div>
        )}
      </div>
    </div>
  );
}
