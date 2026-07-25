import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card } from "@heroui/react";
import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type {
  EnvironmentPreflightCheck,
  EnvironmentPreflightReport,
  EnvironmentPreflightStatus,
} from "@pigui/core";
import { invoke } from "@/shared/runtime";

export const preflightReportQueryKey = ["environment-preflight-report"] as const;
export const preflightStatusQueryKey = ["environment-preflight-status"] as const;

async function runEnvironmentPreflight() {
  return invoke<EnvironmentPreflightReport>("run_environment_preflight");
}

async function getEnvironmentPreflightStatus() {
  return invoke<EnvironmentPreflightStatus>("get_environment_preflight_status");
}

async function completeEnvironmentPreflight() {
  return invoke<EnvironmentPreflightStatus>("complete_environment_preflight");
}

function statusLabel(check: EnvironmentPreflightCheck) {
  switch (check.status) {
    case "pass":
      return "OK";
    case "fail":
      return "FAIL";
    case "skip":
      return "--";
    case "checking":
      return "...";
  }
}

function statusTone(check: EnvironmentPreflightCheck) {
  switch (check.status) {
    case "pass":
      return "border-success/40 bg-success/10 text-success";
    case "fail":
      return "border-danger/40 bg-danger/10 text-danger";
    case "skip":
      return "border-border bg-surface-muted text-muted";
    case "checking":
      return "border-warning/40 bg-warning/10 text-warning";
  }
}

function CheckRow({ check }: { check: EnvironmentPreflightCheck }) {
  const required = check.severity === "required";

  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div
          aria-label={`${check.title} status ${statusLabel(check)}`}
          className={`flex size-12 shrink-0 items-center justify-center rounded-md border text-xs font-semibold ${statusTone(check)}`}
        >
          {statusLabel(check)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">{check.title}</h2>
            <span className="text-xs text-muted">{required ? "required" : "optional"}</span>
          </div>
          <p className="mt-1 text-sm text-foreground">{check.summary}</p>
          {check.detail ? <p className="mt-1 text-xs text-muted">{check.detail}</p> : null}
          {check.status === "fail" && check.remediation && check.remediation.length > 0 ? (
            <div className="mt-3 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-foreground">
              <div className="font-semibold text-danger">Fix</div>
              <ol className="mt-1 list-decimal space-y-1 pl-4">
                {check.remediation.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {check.docsUrl ? (
                <a
                  className="mt-2 inline-block text-primary underline"
                  href={check.docsUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open docs
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PreflightPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reportQuery = useQuery({
    queryKey: preflightReportQueryKey,
    queryFn: runEnvironmentPreflight,
  });
  const statusQuery = useQuery({
    queryKey: preflightStatusQueryKey,
    queryFn: getEnvironmentPreflightStatus,
  });
  const completeMutation = useMutation({
    mutationFn: completeEnvironmentPreflight,
    onSuccess: async (status) => {
      queryClient.setQueryData(preflightStatusQueryKey, status);
      await queryClient.invalidateQueries({ queryKey: preflightStatusQueryKey });
      await navigate({ to: "/", replace: true });
    },
  });

  const report = reportQuery.data;
  const canContinue = report?.canContinue === true;
  const checks = useMemo(() => report?.checks ?? [], [report?.checks]);

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            PiGUI — Environment check
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">Before your first session</h1>
          <p className="text-sm text-muted">
            Check local prerequisites. Required items must pass. Git is optional and never blocks
            Continue.
          </p>
          {statusQuery.data?.completedAt ? (
            <p className="text-xs text-muted">
              Previously completed at {new Date(statusQuery.data.completedAt).toLocaleString()}
            </p>
          ) : null}
        </header>

        <Card>
          <Card.Content className="flex flex-col gap-3">
            {reportQuery.isLoading ? (
              <div className="rounded-md border border-border bg-surface-muted px-4 py-10 text-sm text-muted">
                Checking environment…
              </div>
            ) : reportQuery.isError ? (
              <div className="rounded-md border border-border bg-surface-muted px-4 py-10 text-sm text-danger">
                Could not run environment checks.
              </div>
            ) : (
              checks.map((check) => <CheckRow key={check.id} check={check} />)
            )}
          </Card.Content>
        </Card>

        <p className="text-xs text-muted">
          Optional items never block. Failed required rows expand with Fix steps. After the first
          successful Continue, this gate only reappears when you open it from Setup.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            onPress={() => {
              void reportQuery.refetch();
            }}
            isDisabled={reportQuery.isFetching}
          >
            Recheck
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onPress={() => {
                void navigate({ to: "/setup" });
              }}
            >
              Open Setup later
            </Button>
            <Button
              variant="primary"
              isDisabled={!canContinue || completeMutation.isPending}
              onPress={() => {
                completeMutation.mutate();
              }}
            >
              {canContinue ? "Continue →" : "Continue (disabled)"}
            </Button>
          </div>
        </div>

        {!canContinue && report ? (
          <p className="text-xs text-muted">
            Continue is enabled only when all required checks pass.
          </p>
        ) : null}
        {completeMutation.isError ? (
          <p className="text-sm text-danger">
            {completeMutation.error instanceof Error
              ? completeMutation.error.message
              : "Could not complete preflight."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
