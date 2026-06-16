{{/*
================================================================================
  DataSentinel — template helpers
================================================================================
*/}}

{{/* Base chart name, overridable via .Values.nameOverride. */}}
{{- define "datasentinel.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Fully-qualified release name. Overridable via .Values.fullnameOverride.
Follows the standard Helm pattern (avoids duplicating the chart name when the
release is already named after the chart).
*/}}
{{- define "datasentinel.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart name + version, used in the helm.sh/chart label. */}}
{{- define "datasentinel.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels applied to every object. */}}
{{- define "datasentinel.labels" -}}
helm.sh/chart: {{ include "datasentinel.chart" . }}
{{ include "datasentinel.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: datasentinel
{{- with .Values.commonLabels }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Selector labels — the immutable subset used in matchLabels/selectors. */}}
{{- define "datasentinel.selectorLabels" -}}
app.kubernetes.io/name: {{ include "datasentinel.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Common annotations (merged from .Values.commonAnnotations). */}}
{{- define "datasentinel.annotations" -}}
{{- with .Values.commonAnnotations }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* ServiceAccount name to use. */}}
{{- define "datasentinel.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "datasentinel.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
--------------------------------------------------------------------------------
  Connection-string helpers
  These render into Secrets (stringData), so credentials never appear in plain
  ConfigMaps. Passwords with URL-reserved characters should be URL-encoded in
  values, or supplied via an existing/External Secret.
--------------------------------------------------------------------------------
*/}}

{{/* PostgreSQL DSN shared by all three backend services. */}}
{{- define "datasentinel.databaseUrl" -}}
{{- if .Values.database.url -}}
{{- .Values.database.url -}}
{{- else -}}
{{- printf "postgresql://%s:%s@%s:%v/%s?sslmode=%s" .Values.database.user .Values.database.password .Values.database.host (.Values.database.port | toString) .Values.database.name .Values.database.sslMode -}}
{{- end -}}
{{- end -}}

{{/* Redis base (scheme://[:password@]host:port) — append the DB index per service. */}}
{{- define "datasentinel.redisBase" -}}
{{- $r := .Values.redis -}}
{{- if $r.password -}}
{{- printf "redis://:%s@%s:%v" $r.password $r.host ($r.port | toString) -}}
{{- else -}}
{{- printf "redis://%s:%v" $r.host ($r.port | toString) -}}
{{- end -}}
{{- end -}}

{{/* ClickHouse HTTP endpoint (gateway + workers). */}}
{{- define "datasentinel.clickhouseHttp" -}}
{{- if .Values.clickhouse.httpUrl -}}
{{- .Values.clickhouse.httpUrl -}}
{{- else -}}
{{- printf "http://%s:%v" .Values.clickhouse.host (.Values.clickhouse.httpPort | toString) -}}
{{- end -}}
{{- end -}}

{{/* ClickHouse native endpoint host:port (control-plane). */}}
{{- define "datasentinel.clickhouseNative" -}}
{{- if .Values.clickhouse.nativeUrl -}}
{{- .Values.clickhouse.nativeUrl -}}
{{- else -}}
{{- printf "%s:%v" .Values.clickhouse.host (.Values.clickhouse.nativePort | toString) -}}
{{- end -}}
{{- end -}}

{{/*
--------------------------------------------------------------------------------
  Image helper. Usage: include "datasentinel.image" (dict "root" $ "svc" .Values.controlPlane)
--------------------------------------------------------------------------------
*/}}
{{- define "datasentinel.image" -}}
{{- $root := .root -}}
{{- $svc := .svc -}}
{{- $registry := $svc.image.registry | default $root.Values.image.registry -}}
{{- $repo := $svc.image.repository -}}
{{- $tag := $svc.image.tag | default $root.Values.image.tag | default $root.Chart.AppVersion -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry $repo $tag -}}
{{- else -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
{{- end -}}

{{/* imagePullSecrets block. */}}
{{- define "datasentinel.imagePullSecrets" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
{{- range . }}
  - name: {{ . }}
{{- end }}
{{- end }}
{{- end -}}

{{/* Per-service object names. */}}
{{- define "datasentinel.controlPlane.fullname" -}}{{ include "datasentinel.fullname" . }}-control-plane{{- end -}}
{{- define "datasentinel.gateway.fullname" -}}{{ include "datasentinel.fullname" . }}-gateway{{- end -}}
{{- define "datasentinel.frontend.fullname" -}}{{ include "datasentinel.fullname" . }}-frontend{{- end -}}
{{- define "datasentinel.workers.fullname" -}}{{ include "datasentinel.fullname" . }}-workers{{- end -}}

{{/* JWT secret name (created here or referenced as existing). */}}
{{- define "datasentinel.jwtSecretName" -}}
{{- if .Values.jwt.existingSecret -}}
{{- .Values.jwt.existingSecret -}}
{{- else -}}
{{- printf "%s-jwt" (include "datasentinel.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
--------------------------------------------------------------------------------
  Pod anti-affinity helper. Usage:
    include "datasentinel.podAntiAffinity" (dict "root" $ "component" "control-plane")
  Honors .Values.defaultPodAntiAffinity (soft|hard|"").
--------------------------------------------------------------------------------
*/}}
{{- define "datasentinel.podAntiAffinity" -}}
{{- $root := .root -}}
{{- $component := .component -}}
{{- $mode := $root.Values.defaultPodAntiAffinity -}}
{{- if eq $mode "hard" }}
podAntiAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    - labelSelector:
        matchLabels:
          app.kubernetes.io/name: {{ include "datasentinel.name" $root }}
          app.kubernetes.io/instance: {{ $root.Release.Name }}
          app.kubernetes.io/component: {{ $component }}
      topologyKey: kubernetes.io/hostname
{{- else if eq $mode "soft" }}
podAntiAffinity:
  preferredDuringSchedulingIgnoredDuringExecution:
    - weight: 100
      podAffinityTerm:
        labelSelector:
          matchLabels:
            app.kubernetes.io/name: {{ include "datasentinel.name" $root }}
            app.kubernetes.io/instance: {{ $root.Release.Name }}
            app.kubernetes.io/component: {{ $component }}
        topologyKey: kubernetes.io/hostname
{{- end }}
{{- end -}}
