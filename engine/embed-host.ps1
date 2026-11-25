param([int]$ParentPid)

# dsh-vsing embed helper.
# Reads one JSON request per line on stdin, writes one JSON response per line on stdout.
# Commands: ping | parent | find | launch | attach | move | detach | quit

$ErrorActionPreference = 'Stop'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class W32 {
  [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SetParent(IntPtr child, IntPtr parent);
  [DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowLong(IntPtr h, int idx);
  [DllImport("user32.dll", SetLastError=true)] public static extern int SetWindowLong(IntPtr h, int idx, int val);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, System.Text.StringBuilder s, int max);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
'@

# 必须先把进程设成 per-monitor DPI aware，否则 SetWindowPos 收到的是被系统缩放过的逻辑坐标，
# 前端按 devicePixelRatio 换算出来的物理像素会整体偏移。
try { [void][W32]::SetProcessDpiAwarenessContext([IntPtr](-4)) } catch { }


$GWL_STYLE = -16
$WS_CAPTION = 0x00C00000
$WS_POPUP = 0x80000000
$WS_CHILD = 0x40000000
$WS_VISIBLE = 0x10000000
$SWP_FRAMECHANGED = 0x0020
$SWP_SHOWWINDOW = 0x0040
$HWND_TOP = [IntPtr]::Zero

$script:state = @{ hwnd = [IntPtr]::Zero; parent = [IntPtr]::Zero; style = 0; attached = $false; pid = 0 }

function Get-WindowsOf([int]$procId) {
  $list = New-Object System.Collections.ArrayList
  $cb = [W32+EnumProc]{
    param($h, $p)
    $wpid = 0
    [void][W32]::GetWindowThreadProcessId($h, [ref]$wpid)
    if ($procId -eq 0 -or $wpid -eq $procId) { [void]$list.Add([IntPtr]$h) }
    return $true
  }
  [void][W32]::EnumWindows($cb, [IntPtr]::Zero)
  return $list
}

function Get-WindowTitle([IntPtr]$h) {
  $sb = New-Object System.Text.StringBuilder 512
  [void][W32]::GetWindowTextW($h, $sb, 512)
  return $sb.ToString()
}

# 给失败排查用：把某个进程的所有顶层窗口状态写到临时文件，别靠猜。
function Dump-Windows([int]$procId) {
  $lines = New-Object System.Collections.ArrayList
  [void]$lines.Add("procId=$procId")
  foreach ($h in (Get-WindowsOf $procId)) {
    $style = [W32]::GetWindowLong($h, $GWL_STYLE)
    $r = New-Object W32+RECT
    [void][W32]::GetClientRect($h, [ref]$r)
    $area = ($r.Right - $r.Left) * ($r.Bottom - $r.Top)
    [void]$lines.Add(("hwnd={0} visible={1} parent={2} style=0x{3:X} caption={4} area={5} title={6}" -f ([int64]$h), [W32]::IsWindowVisible($h), ([int64][W32]::GetParent($h)), $style, (($style -band $WS_CAPTION) -ne 0), $area, (Get-WindowTitle $h)))
  }
  $out = Join-Path $env:TEMP 'dsh-vsing-embed-debug.txt'
  [System.IO.File]::WriteAllText($out, ($lines -join [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
  return $out
}

function Find-BigWindow([int]$procId) {
  $best = [IntPtr]::Zero
  $bestArea = 0
  $fallback = [IntPtr]::Zero
  $fallbackArea = 0
  foreach ($h in (Get-WindowsOf $procId)) {
    if (-not [W32]::IsWindowVisible($h)) { continue }
    if ([W32]::GetParent($h) -ne [IntPtr]::Zero) { continue }
    $r = New-Object W32+RECT
    $clientOk = [W32]::GetClientRect($h, [ref]$r)
    $area = if ($clientOk) { ($r.Right - $r.Left) * ($r.Bottom - $r.Top) } else { 0 }
    if ($area -le 0) {
      # 最小化窗口的客户区是 0x0，退回窗口矩形，否则它永远比不过别的候选
      $wr = New-Object W32+RECT
      if ([W32]::GetWindowRect($h, [ref]$wr)) {
        $area = ($wr.Right - $wr.Left) * ($wr.Bottom - $wr.Top)
      }
    }
    $style = [W32]::GetWindowLong($h, $GWL_STYLE)
    if (($style -band $WS_CAPTION) -ne 0) {
      if ($area -gt $bestArea) { $bestArea = $area; $best = [IntPtr]$h }
    } elseif ($area -gt $fallbackArea) {
      $fallbackArea = $area; $fallback = [IntPtr]$h
    }
  }
  if ($best -ne [IntPtr]::Zero) { return @{ hwnd = $best; area = $bestArea } }
  return @{ hwnd = $fallback; area = $fallbackArea }
}

function Get-ProcIdsByName([string]$name) {
  return @(Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
}

function Get-ProcIdByName([string]$name) {
  $ids = Get-ProcIdsByName $name
  if ($ids.Count -eq 0) { return 0 }
  return $ids[0]
}

# 同名进程可能不止一个（启动器 / 子进程），逐个找面积最大的那个窗口。
function Find-WindowOfProcess([string]$name) {
  $best = @{ hwnd = [IntPtr]::Zero; area = 0 }
  foreach ($procId in (Get-ProcIdsByName $name)) {
    $found = Find-BigWindow $procId
    if ($found.area -gt $best.area) { $best = $found }
  }
  return $best
}

function Get-ChildWindowsOf([IntPtr]$parent) {
  $list = New-Object System.Collections.ArrayList
  $cb = [W32+EnumProc]{
    param($h, $p)
    [void]$list.Add([IntPtr]$h)
    return $true
  }
  [void][W32]::EnumChildWindows($parent, $cb, [IntPtr]::Zero)
  return $list
}

# 把已经嵌进去的原生窗口放回去：恢复成顶层可见带标题的普通窗口。
# 不依赖内存里的 state——helper 重启过、窗口还挂在宿主下面时也要能救回来。
function Release-Window([IntPtr]$hwnd) {
  if ($hwnd -eq [IntPtr]::Zero -or -not [W32]::IsWindow($hwnd)) { return $false }
  $style = [W32]::GetWindowLong($hwnd, $GWL_STYLE)
  $restored = ($style -band (-bnot $WS_CHILD)) -bor $WS_POPUP -bor $WS_CAPTION -bor $WS_VISIBLE
  [void][W32]::SetWindowLong($hwnd, $GWL_STYLE, $restored)
  [void][W32]::SetParent($hwnd, [IntPtr]::Zero)
  [void][W32]::SetWindowPos($hwnd, $HWND_TOP, 120, 120, 1280, 800, ($SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW))
  [void][W32]::ShowWindow($hwnd, 5)
  return $true
}

# 找出「属于某个进程、又被挂在宿主窗口下面」的子窗口（SetParent 之后它们不再是顶层窗口）。
function Find-EmbeddedChild([IntPtr]$parent, [int[]]$pids) {
  if ($parent -eq [IntPtr]::Zero -or -not [W32]::IsWindow($parent)) { return [IntPtr]::Zero }
  $best = [IntPtr]::Zero
  $bestArea = 0
  foreach ($h in (Get-ChildWindowsOf $parent)) {
    $wpid = 0
    [void][W32]::GetWindowThreadProcessId($h, [ref]$wpid)
    if ($pids.Count -gt 0 -and $pids -notcontains [int]$wpid) { continue }
    $r = New-Object W32+RECT
    if (-not [W32]::GetWindowRect($h, [ref]$r)) { continue }
    $area = ($r.Right - $r.Left) * ($r.Bottom - $r.Top)
    if ($area -ge $bestArea) { $bestArea = $area; $best = [IntPtr]$h }
  }
  return $best
}

# 按标题找最大的可见顶层带标题窗口。宿主 pid 不一定是拥有窗口的那个进程
# （Electron 的主窗口可能挂在另一个 pid 上），所以给 pid 搜索兜个底。
function Find-TitledWindow([string]$needle) {
  $best = [IntPtr]::Zero
  $bestArea = 0
  foreach ($h in (Get-WindowsOf 0)) {
    if (-not [W32]::IsWindowVisible($h)) { continue }
    if ([W32]::GetParent($h) -ne [IntPtr]::Zero) { continue }
    $style = [W32]::GetWindowLong($h, $GWL_STYLE)
    if (($style -band $WS_CAPTION) -eq 0) { continue }
    $buf = New-Object System.Text.StringBuilder 512
    [void][W32]::GetWindowTextW($h, $buf, 512)
    if ($buf.ToString().IndexOf($needle, [StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
    $r = New-Object W32+RECT
    if (-not [W32]::GetClientRect($h, [ref]$r)) { continue }
    $area = ($r.Right - $r.Left) * ($r.Bottom - $r.Top)
    if ($area -gt $bestArea) { $bestArea = $area; $best = [IntPtr]$h }
  }
  return @{ hwnd = $best; area = $bestArea }
}

function Resolve-Parent() {
  $found = @{ hwnd = [IntPtr]::Zero; area = 0 }
  if ($ParentPid -gt 0) { $found = Find-BigWindow $ParentPid }
  if ($found.hwnd -eq [IntPtr]::Zero) { $found = Find-TitledWindow 'DeepSeek Harness' }
  if ($found.hwnd -eq [IntPtr]::Zero) { $found = Find-BigWindow 0 }
  return $found
}

function Reply($obj) {
  [Console]::Out.WriteLine((ConvertTo-Json -Compress -InputObject $obj -Depth 4))
  [Console]::Out.Flush()
}

$parentHwnd = [IntPtr]::Zero
$resolved = Resolve-Parent
$parentHwnd = $resolved.hwnd

Reply @{ ok = $true; event = 'ready'; parentHwnd = [int64]$parentHwnd; parentPid = $ParentPid; helperPid = $PID }

while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line.Trim().Length -eq 0) { continue }

  try {
    $req = $line | ConvertFrom-Json
    $cmd = [string]$req.cmd
    $resp = @{ ok = $true; cmd = $cmd }

    switch ($cmd) {
      'ping' {
        $resp.attached = $script:state.attached
        $resp.hwnd = [int64]$script:state.hwnd
      }
      'parent' {
        $found = Resolve-Parent
        $parentHwnd = $found.hwnd
        $resp.parentHwnd = [int64]$parentHwnd
        $resp.area = $found.area
      }
      'find' {
        $found = Find-WindowOfProcess ([string]$req.process)
        $procId = Get-ProcIdByName ([string]$req.process)
        $resp.process = [string]$req.process
        $resp.pid = $procId
        $resp.hwnd = [int64]$found.hwnd
        $resp.area = $found.area
      }
      'launch' {
        $exe = [string]$req.path
        if (-not (Test-Path -LiteralPath $exe)) { throw "not found: $exe" }
        Start-Process -FilePath $exe | Out-Null
        $resp.path = $exe
      }
      'attach' {
        if ($parentHwnd -eq [IntPtr]::Zero) {
          $found = Resolve-Parent
          $parentHwnd = $found.hwnd
        }
        if ($parentHwnd -eq [IntPtr]::Zero) { throw 'parent window not found' }

        $procId = if ($req.process) { Get-ProcIdByName ([string]$req.process) } else { [int]$script:state.pid }
        $found = if ($req.process) { Find-WindowOfProcess ([string]$req.process) } else { Find-BigWindow $procId }
        $hwnd = $found.hwnd
        if ($hwnd -eq [IntPtr]::Zero) {
          $dump = Dump-Windows $procId
          throw "target window not found (process=$($req.process), pid=$procId, dump=$dump)"
        }

        if ($script:state.attached -and $script:state.hwnd -ne $hwnd) {
          [void][W32]::SetParent($script:state.hwnd, [IntPtr]::Zero)
        }

        [void][W32]::ShowWindow($hwnd, 9)
        $style = [W32]::GetWindowLong($hwnd, $GWL_STYLE)
        $newStyle = ($style -band (-bnot $WS_POPUP) -band (-bnot $WS_CAPTION)) -bor $WS_CHILD -bor $WS_VISIBLE
        [void][W32]::SetWindowLong($hwnd, $GWL_STYLE, $newStyle)
        [void][W32]::SetParent($hwnd, $parentHwnd)
        $x = [int]$req.x; $y = [int]$req.y; $w = [int]$req.width; $h = [int]$req.height
        [void][W32]::SetWindowPos($hwnd, $HWND_TOP, $x, $y, $w, $h, ($SWP_FRAMECHANGED -bor $SWP_SHOWWINDOW))
        [void][W32]::ShowWindow($hwnd, 5)

        $script:state.hwnd = $hwnd
        $script:state.parent = $parentHwnd
        $script:state.style = $style
        $script:state.pid = $procId
        $script:state.attached = $true

        $resp.hwnd = [int64]$hwnd
        $resp.parentHwnd = [int64]$parentHwnd
        $resp.bounds = @{ x = $x; y = $y; width = $w; height = $h }
      }
      'move' {
        if (-not $script:state.attached) { throw 'not attached' }
        $x = [int]$req.x; $y = [int]$req.y; $w = [int]$req.width; $h = [int]$req.height
        [void][W32]::SetWindowPos($script:state.hwnd, $HWND_TOP, $x, $y, $w, $h, $SWP_SHOWWINDOW)
        $resp.bounds = @{ x = $x; y = $y; width = $w; height = $h }
      }
      'detach' {
        if ($script:state.attached) {
          [void][W32]::SetWindowLong($script:state.hwnd, $GWL_STYLE, $script:state.style)
          [void][W32]::SetParent($script:state.hwnd, [IntPtr]::Zero)
          [void][W32]::SetWindowPos($script:state.hwnd, $HWND_TOP, 120, 120, 1280, 800, $SWP_FRAMECHANGED)
          [void][W32]::ShowWindow($script:state.hwnd, 5)
        } else {
          $orphan = Find-EmbeddedChild $parentHwnd @()
          if ($orphan -ne [IntPtr]::Zero) { [void](Release-Window $orphan) }
        }
        $script:state.attached = $false
        $resp.detached = $true
      }
      'release' {
        # 无论 helper 有没有记着状态，都把挂在宿主下面的原生窗口放回去。
        # 宿主进程重启过时，还能按 hwnd 直接点名救（那种窗口已经不属于任何活着的父窗口）。
        $ids = @()
        if ($req.process) { $ids = [int[]](Get-ProcIdsByName ([string]$req.process)) }
        $target = [IntPtr]::Zero
        if ($req.hwnd) {
          $target = [IntPtr][int64]$req.hwnd
        } elseif ($script:state.attached) {
          $target = $script:state.hwnd
        } else {
          $target = Find-EmbeddedChild $parentHwnd $ids
        }
        $resp.released = (Release-Window $target)
        $resp.hwnd = [int64]$target
        $script:state.attached = $false
      }
      'quit' {
        # 退出前务必把原生窗口还回去，否则它会作为宿主的子窗口留在原地挡住工作。
        if ($script:state.attached) {
          [void](Release-Window $script:state.hwnd)
        } else {
          $orphan = Find-EmbeddedChild $parentHwnd @()
          if ($orphan -ne [IntPtr]::Zero) { [void](Release-Window $orphan) }
        }
        $resp.ok = $true
        Reply $resp
        break
      }
      default { throw "unknown cmd: $cmd" }
    }
    Reply $resp
  } catch {
    Reply @{ ok = $false; error = $_.Exception.Message }
  }
}
