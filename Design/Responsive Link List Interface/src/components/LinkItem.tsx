import { Switch } from "./ui/switch";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Trash2, RotateCcw, Clock, Moon } from "lucide-react";

export type LinkType = {
  id: string;
  url: string;
  title: string;
  visited: boolean;
  refreshType: "midnight" | "interval";
};

type LinkItemProps = {
  link: LinkType;
  onDelete: (id: string) => void;
  onMarkUnvisited: (id: string) => void;
  onToggleRefreshType: (id: string) => void;
  onVisit: (id: string) => void;
};

export function LinkItem({
  link,
  onDelete,
  onMarkUnvisited,
  onToggleRefreshType,
  onVisit,
}: LinkItemProps) {
  return (
    <div
      className={`
        border border-border rounded-lg p-4 transition-all
        ${link.visited ? "bg-muted/50" : "bg-card hover:shadow-md"}
      `}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => onVisit(link.id)}
              className={`
                transition-colors hover:underline
                ${link.visited ? "text-muted-foreground" : "text-foreground"}
              `}
            >
              {link.title}
            </a>
            {link.visited && (
              <Badge variant="secondary" className="shrink-0">
                Visited
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground truncate">{link.url}</p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {link.refreshType === "midnight" ? (
              <Moon className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground" />
            )}
            <Switch
              checked={link.refreshType === "interval"}
              onCheckedChange={() => onToggleRefreshType(link.id)}
              aria-label={`Toggle refresh type to ${
                link.refreshType === "midnight" ? "interval" : "midnight"
              }`}
            />
          </div>

          {link.visited ? (
            <Button
              variant="outline"
              size="icon"
              onClick={() => onMarkUnvisited(link.id)}
              aria-label="Mark as unvisited"
              className="shrink-0"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="icon"
              onClick={() => onDelete(link.id)}
              aria-label="Delete link"
              className="shrink-0 hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
