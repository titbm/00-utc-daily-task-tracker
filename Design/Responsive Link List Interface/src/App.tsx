import { useState } from "react";
import { LinkItem, LinkType } from "./components/LinkItem";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { RotateCcw, Plus, Link as LinkIcon } from "lucide-react";
import { Separator } from "./components/ui/separator";

const initialLinks: LinkType[] = [
  {
    id: "1",
    url: "https://example.com/dashboard",
    title: "Dashboard",
    visited: false,
    refreshType: "midnight",
  },
  {
    id: "2",
    url: "https://example.com/analytics",
    title: "Analytics",
    visited: true,
    refreshType: "interval",
  },
  {
    id: "3",
    url: "https://example.com/reports",
    title: "Reports",
    visited: false,
    refreshType: "interval",
  },
  {
    id: "4",
    url: "https://example.com/settings",
    title: "Settings",
    visited: true,
    refreshType: "midnight",
  },
  {
    id: "5",
    url: "https://example.com/profile",
    title: "Profile",
    visited: false,
    refreshType: "midnight",
  },
];

export default function App() {
  const [links, setLinks] = useState<LinkType[]>(initialLinks);
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [newLinkTitle, setNewLinkTitle] = useState("");

  const unvisitedLinks = links.filter((link) => !link.visited);
  const visitedLinks = links.filter((link) => link.visited);

  const handleDelete = (id: string) => {
    setLinks(links.filter((link) => link.id !== id));
  };

  const handleMarkUnvisited = (id: string) => {
    setLinks(
      links.map((link) =>
        link.id === id ? { ...link, visited: false } : link
      )
    );
  };

  const handleMarkAllUnvisited = () => {
    setLinks(links.map((link) => ({ ...link, visited: false })));
  };

  const handleToggleRefreshType = (id: string) => {
    setLinks(
      links.map((link) =>
        link.id === id
          ? {
              ...link,
              refreshType: link.refreshType === "midnight" ? "interval" : "midnight",
            }
          : link
      )
    );
  };

  const handleVisit = (id: string) => {
    setLinks(
      links.map((link) =>
        link.id === id ? { ...link, visited: true } : link
      )
    );
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim() || !newLinkTitle.trim()) return;

    const newLink: LinkType = {
      id: Date.now().toString(),
      url: newLinkUrl,
      title: newLinkTitle,
      visited: false,
      refreshType: "midnight",
    };

    setLinks([...links, newLink]);
    setNewLinkUrl("");
    setNewLinkTitle("");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <LinkIcon className="w-8 h-8" />
            <h1>Link Manager</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your links with refresh types and visit tracking
          </p>
        </div>

        {/* Add New Link */}
        <div className="bg-card border border-border rounded-lg p-6 mb-8">
          <h2 className="mb-4">Add New Link</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Link title"
              value={newLinkTitle}
              onChange={(e) => setNewLinkTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
              className="flex-1"
            />
            <Input
              placeholder="https://example.com"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
              className="flex-1"
            />
            <Button
              onClick={handleAddLink}
              className="sm:w-auto"
              disabled={!newLinkUrl.trim() || !newLinkTitle.trim()}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        {/* Unvisited Links */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2>Unvisited Links ({unvisitedLinks.length})</h2>
          </div>
          {unvisitedLinks.length === 0 ? (
            <div className="bg-muted/30 border border-border rounded-lg p-8 text-center text-muted-foreground">
              No unvisited links
            </div>
          ) : (
            <div className="space-y-3">
              {unvisitedLinks.map((link) => (
                <LinkItem
                  key={link.id}
                  link={link}
                  onDelete={handleDelete}
                  onMarkUnvisited={handleMarkUnvisited}
                  onToggleRefreshType={handleToggleRefreshType}
                  onVisit={handleVisit}
                />
              ))}
            </div>
          )}
        </div>

        <Separator className="my-8" />

        {/* Visited Links */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2>Visited Links ({visitedLinks.length})</h2>
            {visitedLinks.length > 0 && (
              <Button
                variant="outline"
                onClick={handleMarkAllUnvisited}
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset All
              </Button>
            )}
          </div>
          {visitedLinks.length === 0 ? (
            <div className="bg-muted/30 border border-border rounded-lg p-8 text-center text-muted-foreground">
              No visited links
            </div>
          ) : (
            <div className="space-y-3">
              {visitedLinks.map((link) => (
                <LinkItem
                  key={link.id}
                  link={link}
                  onDelete={handleDelete}
                  onMarkUnvisited={handleMarkUnvisited}
                  onToggleRefreshType={handleToggleRefreshType}
                  onVisit={handleVisit}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
