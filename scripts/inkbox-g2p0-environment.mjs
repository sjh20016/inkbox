import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';

export function readPerformanceSurface(value = process.env.INKBOX_PERF_SURFACE) {
  const surface = value ?? 'headless';
  if (!['headless', 'foreground'].includes(surface)) {
    throw new Error(`INKBOX_PERF_SURFACE must be headless or foreground (received ${JSON.stringify(surface)})`);
  }
  return surface;
}

const windowsEvidenceScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class InkboxWindowEvidence {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Auto)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
}
'@
$rootPid = [int]$env:INKBOX_EVIDENCE_ROOT_PID
$profile = [IO.Path]::GetFullPath($env:INKBOX_EVIDENCE_PROFILE).TrimEnd('\')
$profileTempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$profilePathValidated = ([IO.Path]::GetDirectoryName($profile).TrimEnd('\') -ieq $profileTempRoot) -and ((Split-Path -Leaf $profile) -match '^cdp-[a-z0-9]{6}$')
$hwnd = [InkboxWindowEvidence]::GetForegroundWindow()
[uint32]$foregroundPid = 0
[void][InkboxWindowEvidence]::GetWindowThreadProcessId($hwnd, [ref]$foregroundPid)
$all = @(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,Name)
$lineage = @()
$cursor = [int]$foregroundPid
for ($i=0; $i -lt 32 -and $cursor -gt 0; $i++) {
  $proc = $all | Where-Object ProcessId -eq $cursor | Select-Object -First 1
  if (-not $proc) { break }
  $lineage += $proc
  if ($cursor -eq $rootPid) { break }
  $cursor = [int]$proc.ParentProcessId
}
$foregroundProc = $all | Where-Object ProcessId -eq $foregroundPid | Select-Object -First 1
$launcherProc = $all | Where-Object ProcessId -eq $rootPid | Select-Object -First 1
$foregroundCommandLine = [string]$foregroundProc.CommandLine
$exactProfileArgPattern = '(?i)(?:^|\s)--user-data-dir=(?:"' + [regex]::Escape($profile) + '"|' + [regex]::Escape($profile) + ')(?=\s|$)'
$foregroundHasExactProfileArg = $profilePathValidated -and $foregroundCommandLine -match $exactProfileArgPattern
$foregroundIsEdge = $foregroundProc.Name -ieq 'msedge.exe'
$foregroundOwnProfileProcess = $foregroundIsEdge -and $foregroundHasExactProfileArg
$foregroundOwnershipReason = if (@($lineage | Where-Object ProcessId -eq $rootPid).Count -gt 0) { 'Foreground process ancestry reaches the launched Edge PID.' } elseif ($foregroundOwnProfileProcess) { 'Foreground PID is msedge.exe with this run exact --user-data-dir argument under the validated cdp-owned Temp profile.' } else { 'Foreground PID is neither in the launched Edge process ancestry nor an msedge.exe process with this run exact owned profile argument.' }
$rect = New-Object InkboxWindowEvidence+RECT
$hasRect = [InkboxWindowEvidence]::GetWindowRect($hwnd, [ref]$rect)
$monitor = [InkboxWindowEvidence]::MonitorFromWindow($hwnd, 2)
$mi = New-Object InkboxWindowEvidence+MONITORINFO
$mi.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($mi)
$hasMonitor = [InkboxWindowEvidence]::GetMonitorInfo($monitor, [ref]$mi)
$activePower = $null
try { $activePower = (powercfg /getactivescheme 2>&1 | Out-String).Trim() } catch { $activePower = "unavailable: $($_.Exception.Message)" }
$sameProfile = @($lineage | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($profile,[StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count -gt 0
$inTree = @($lineage | Where-Object ProcessId -eq $rootPid).Count -gt 0
$width = if ($hasRect) { $rect.Right - $rect.Left } else { $null }
$height = if ($hasRect) { $rect.Bottom - $rect.Top } else { $null }
$monitorData = if ($hasMonitor) { @{ bounds=@($mi.rcMonitor.Left,$mi.rcMonitor.Top,$mi.rcMonitor.Right,$mi.rcMonitor.Bottom); workArea=@($mi.rcWork.Left,$mi.rcWork.Top,$mi.rcWork.Right,$mi.rcWork.Bottom); primary=([bool]($mi.dwFlags -band 1)) } } else { $null }
[pscustomobject]@{
  supported=$true; foregroundPid=[int]$foregroundPid; foregroundName=($all | Where-Object ProcessId -eq $foregroundPid | Select-Object -First 1).Name
  rootPid=$rootPid; foregroundInOwnedEdgeTree=$inTree; foregroundSameProfile=$sameProfile
  ownedProfilePathValidated=$profilePathValidated; foregroundIsEdgeProcess=$foregroundIsEdge
  foregroundHasExactOwnedProfileArg=$foregroundHasExactProfileArg; foregroundOwnProfileProcess=$foregroundOwnProfileProcess
  foregroundOwnershipReason=$foregroundOwnershipReason
  launcherProcessPresent=($null -ne $launcherProc); launcherExitedObserved=($null -eq $launcherProc)
  launcherEvidence=if ($launcherProc) { 'Win32_Process snapshot found launched PID still present.' } else { 'Win32_Process snapshot no longer contains launched PID.' }
  handleVisible=[InkboxWindowEvidence]::IsWindowVisible($hwnd); minimized=[InkboxWindowEvidence]::IsIconic($hwnd)
  handle=('{0}' -f $hwnd); window=if ($hasRect) {@{left=$rect.Left;top=$rect.Top;width=$width;height=$height}} else {$null}
  monitor=$monitorData; monitorQuerySupported=$hasMonitor; powerScheme=$activePower
  evidence='Read-only Windows foreground HWND/PID, process ancestry/profile command line, window bounds, monitor work area, and active power scheme; sampled outside performance timers.'
} | ConvertTo-Json -Depth 5 -Compress
`;

export function isOwnedProfilePath(profile, tempRoot = os.tmpdir()) {
  const target = path.resolve(profile);
  return path.dirname(target).toLowerCase() === path.resolve(tempRoot).toLowerCase()
    && /^cdp-[a-z0-9]{6}$/i.test(path.basename(target));
}

export function readForegroundEvidence({ rootPid, profile }) {
  if (process.platform !== 'win32') {
    return { supported: false, status: 'unsupported', reason: `Windows native foreground evidence is unavailable on ${process.platform}` };
  }
  if (!isOwnedProfilePath(profile)) {
    return { supported: true, status: 'blocked', reason: 'The browser profile is not a direct cdp-XXXXXX child of the system Temp directory.' };
  }
  try {
    const stdout = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(windowsEvidenceScript, 'utf16le').toString('base64')], {
      encoding: 'utf8', windowsHide: true, timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, INKBOX_EVIDENCE_ROOT_PID: String(rootPid), INKBOX_EVIDENCE_PROFILE: profile },
    });
    return JSON.parse(stdout.trim());
  } catch (error) {
    return { supported: true, status: 'blocked', reason: `Windows foreground evidence query failed: ${error.message}` };
  }
}

export function foregroundEvidenceValid(evidence) {
  return evidence?.supported === true
    && evidence.ownedProfilePathValidated === true
    && evidence.foregroundSameProfile === true
    && (evidence.foregroundInOwnedEdgeTree === true
      || (evidence.foregroundOwnProfileProcess === true
        && evidence.foregroundIsEdgeProcess === true
        && evidence.foregroundHasExactOwnedProfileArg === true))
    && evidence.handleVisible === true
    && evidence.minimized === false
    && Number.isFinite(evidence.window?.width) && evidence.window.width > 0
    && Number.isFinite(evidence.window?.height) && evidence.window.height > 0
    && evidence.monitorQuerySupported === true
    && typeof evidence.powerScheme === 'string'
    && evidence.powerScheme.length > 0
    && !/^unavailable:/i.test(evidence.powerScheme);
}

if (process.argv.includes('--check')) {
  assert.equal(readPerformanceSurface(undefined), process.env.INKBOX_PERF_SURFACE ?? 'headless');
  assert.equal(readPerformanceSurface('headless'), 'headless');
  assert.equal(readPerformanceSurface('foreground'), 'foreground');
  for (const value of ['', 'visible', 'Foreground', ' headless']) assert.throws(() => readPerformanceSurface(value));
  assert(isOwnedProfilePath(path.join(os.tmpdir(), 'cdp-XWUuSl')));
  assert.equal(isOwnedProfilePath(path.join(os.tmpdir(), 'cdp-foo')), false);
  assert.equal(isOwnedProfilePath(path.join(os.tmpdir(), 'ordinary-XWUuSl')), false);
  const valid = { supported: true, foregroundInOwnedEdgeTree: false,
    foregroundSameProfile: true, ownedProfilePathValidated: true, foregroundOwnProfileProcess: true,
    foregroundIsEdgeProcess: true, foregroundHasExactOwnedProfileArg: true,
    handleVisible: true, minimized: false,
    window: { width: 1500, height: 940 }, monitorQuerySupported: true,
    powerScheme: 'Power Scheme GUID: test' };
  assert(foregroundEvidenceValid(valid));
  for (const invalid of [{ supported: false }, { foregroundInOwnedEdgeTree: false, foregroundOwnProfileProcess: false },
    { foregroundSameProfile: false }, { handleVisible: false }, { minimized: true },
    { ownedProfilePathValidated: false }, { foregroundIsEdgeProcess: false },
    { foregroundHasExactOwnedProfileArg: false },
    { window: { width: 0, height: 940 } }, { monitorQuerySupported: false },
    { powerScheme: 'unavailable: query failed' }]) {
    assert.equal(foregroundEvidenceValid({ ...valid, ...invalid }), false);
  }
  console.log('G2-P0 environment: surface selection and missing foreground evidence fail closed');
}
