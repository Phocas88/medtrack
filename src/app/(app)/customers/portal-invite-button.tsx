'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Send, Copy, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PortalInviteButtonProps {
  customerId: string;
  customerEmail: string | null;
  customerName: string;
}

export function PortalInviteButton({
  customerId,
  customerEmail,
  customerName,
}: PortalInviteButtonProps) {
  const { tenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [portalActive, setPortalActive] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleInvite(e: React.MouseEvent) {
    e.stopPropagation();
    if (!tenantId || !customerEmail) return;

    setLoading(true);
    try {
      const res = await fetch('/api/portal/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, tenantId }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || 'Failed to send invitation');
        return;
      }

      if (data.alreadyExists) {
        setPortalActive(true);
        toast.info('Portal access already enabled for this customer');
      } else {
        toast.success(`Portal invitation sent to ${customerEmail}`);
      }

      if (data.recoveryLink) {
        setRecoveryLink(data.recoveryLink);
        setDialogOpen(true);
      }
    } catch {
      toast.error('Failed to send portal invitation');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!recoveryLink) return;
    await navigator.clipboard.writeText(recoveryLink);
    setCopied(true);
    toast.success('Link copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  }

  if (portalActive) {
    return (
      <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">
        Portal Active
      </Badge>
    );
  }

  if (!customerEmail) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button
                variant="ghost"
                size="sm"
                disabled
                className="opacity-50"
                onClick={(e) => e.stopPropagation()}
              >
                <Send className="h-4 w-4 mr-1" />
                Invite
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>Customer needs an email address</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleInvite}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Send className="h-4 w-4 mr-1" />
        )}
        Invite to Portal
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Portal Invitation Link</DialogTitle>
            <DialogDescription>
              Share this link with {customerName} so they can set their password and access the customer portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <code className="flex-1 p-3 bg-muted rounded text-sm break-all select-all">
                {recoveryLink}
              </code>
              <Button variant="outline" size="icon" onClick={handleCopy}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              This link will allow {customerName} to set their password and log in at the customer portal.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
