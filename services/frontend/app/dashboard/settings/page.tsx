"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/auth.store";
import { teamAPI } from "@/lib/api/team";
import { apiKeysAPI } from "@/lib/api/apikeys";
import { authAPI } from "@/lib/api/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Copy,
  Trash2,
  Loader2,
  Users,
  Key,
  Bell,
  AlertTriangle,
} from "lucide-react";
import { ROLES } from "@/types/api";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("team");
  const [showApiKey, setShowApiKey] = useState<{ [key: string]: boolean }>({});
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("analyst");
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [showApiDialog, setShowApiDialog] = useState(false);

  // Fetch team members
  const { data: team } = useQuery({
    queryKey: ["team"],
    queryFn: async () => {
      const response = await teamAPI.list();
      return response.data.data || [];
    },
  });

  // Fetch API keys
  const { data: apiKeys } = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const response = await apiKeysAPI.list();
      return response.data.data || [];
    },
  });

  // Invite user mutation
  const inviteUserMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await authAPI.inviteUser(data);
      return response.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team"] });
      setInviteEmail("");
      setInviteRole("analyst");
    },
  });

  // Create API key mutation
  const createApiKeyMutation = useMutation({
    mutationFn: async (data: { name: string; scopes: string[] }) => {
      const response = await apiKeysAPI.create(data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      setNewApiKeyName("");
      setShowApiDialog(false);
    },
  });

  // Delete API key mutation
  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiKeysAPI.revoke(keyId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const handleInvite = async () => {
    if (!inviteEmail) {
      alert("Email is required");
      return;
    }
    await inviteUserMutation.mutateAsync({
      email: inviteEmail,
      role: inviteRole,
    });
  };

  const handleCreateApiKey = async () => {
    if (!newApiKeyName) {
      alert("API key name is required");
      return;
    }
    await createApiKeyMutation.mutateAsync({
      name: newApiKeyName,
      scopes: ["read", "write"],
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-3xl font-bold text-slate-100">Settings</h1>
        <p className="text-slate-400 mt-1">Manage your organization settings</p>
      </motion.div>

      {/* Tabs */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team
            </TabsTrigger>
            <TabsTrigger value="api-keys" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              API Keys
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2">
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
          </TabsList>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>Team Members</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Invite Member
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Send an invitation to a new team member
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-300">
                          Email Address
                        </label>
                        <Input
                          type="email"
                          placeholder="user@company.com"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-slate-300">
                          Role
                        </label>
                        <Select
                          value={inviteRole}
                          onValueChange={setInviteRole}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role.charAt(0).toUpperCase() +
                                  role.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={handleInvite}
                        disabled={inviteUserMutation.isPending}
                      >
                        {inviteUserMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          "Send Invitation"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(team || []).map((member: any) => (
                    <motion.div
                      key={member.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-4 border border-slate-700 rounded-lg bg-slate-800"
                    >
                      <div>
                        <p className="font-medium text-slate-100">
                          {member.full_name || member.email}
                        </p>
                        <p className="text-sm text-slate-400">
                          {member.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge>{member.role}</Badge>
                        {member.id !== user?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              /* Remove member logic */
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-red-400" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* API Keys Tab */}
          <TabsContent value="api-keys" className="space-y-6">
            <Card>
              <CardHeader className="flex items-center justify-between">
                <CardTitle>API Keys</CardTitle>
                <Dialog open={showApiDialog} onOpenChange={setShowApiDialog}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Generate Key
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create API Key</DialogTitle>
                      <DialogDescription>
                        Generate a new API key for programmatic access
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-slate-300">
                          Key Name
                        </label>
                        <Input
                          placeholder="e.g., Production Integration"
                          value={newApiKeyName}
                          onChange={(e) => setNewApiKeyName(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handleCreateApiKey}
                        disabled={createApiKeyMutation.isPending}
                      >
                        {createApiKeyMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          "Generate Key"
                        )}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(apiKeys || []).map((key: any) => (
                    <motion.div
                      key={key.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex items-center justify-between p-4 border border-slate-700 rounded-lg bg-slate-800"
                    >
                      <div>
                        <p className="font-medium text-slate-100">
                          {key.name}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-slate-400 mt-1">
                          <span className="font-mono">
                            {key.key_prefix}...
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                key.key_prefix
                              );
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {key.last_used_at && (
                          <span className="text-xs text-slate-500">
                            Last used:{" "}
                            {new Date(
                              key.last_used_at
                            ).toLocaleDateString()}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            deleteApiKeyMutation.mutate(key.id)
                          }
                          disabled={deleteApiKeyMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Notification settings are coming soon. You'll be able to
                    configure email, Slack, and PagerDuty integrations here.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}

