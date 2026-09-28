# curl tests for the /api routes.
#   1. start the server:  npm run dev        (from the api/ folder)
#   2. run this:          powershell -ExecutionPolicy Bypass -File tests/curl_tests.ps1
# Bodies are built with ConvertTo-Json and passed through a temp file because
# PowerShell 5.1 mangles double quotes in inline native-command arguments.
# Each run uses a fresh email so addEmail does not collide with its own PK.

param([string]$Base = "http://localhost:3000")

$bodyPath = Join-Path $env:TEMP "api_curl_body.json"
$run = "curltest" + (Get-Date -Format "HHmmss") + "@example.com"
$script:pass = 0
$script:fail = 0

function New-Body {
    param([string]$Fn, [object[]]$Params)
    return (@{ function = $Fn; params = $Params } | ConvertTo-Json -Compress)
}

function Invoke-Api {
    param(
        [string]$Label,
        [string]$Path,
        [string]$Json = "",
        [int]$Expect = 200,
        [string]$Method = "POST"
    )

    if ($Json) {
        Set-Content -Path $bodyPath -Value $Json -Encoding ascii -NoNewline
        $out = & curl.exe -s -X $Method -H "Content-Type: application/json" --data-binary "@$bodyPath" -w "`n%{http_code}" "$Base$Path"
    }
    else {
        $out = & curl.exe -s -X $Method -w "`n%{http_code}" "$Base$Path"
    }

    $lines = @($out)
    $last = $lines[-1]

    if ($last -notmatch '^\d+$') {
        Write-Host "FAIL  $Label - no HTTP status (is the server running on $Base ?)" -ForegroundColor Red
        $script:fail++
        return
    }

    $status = [int]$last
    $body = if ($lines.Count -gt 1) { ($lines[0..($lines.Count - 2)] -join " ") } else { "" }

    if ($status -eq $Expect) {
        $script:pass++
        Write-Host "PASS  $status  $Label" -ForegroundColor Green
    }
    else {
        $script:fail++
        Write-Host "FAIL  $status (expected $Expect)  $Label" -ForegroundColor Red
    }

    Write-Host "      $body" -ForegroundColor DarkGray
}

Write-Host "`n== routing (test email: $run) ==" -ForegroundColor Cyan
Invoke-Api -Label "GET / lists the three routes"          -Path "/"          -Method "GET" -Expect 200
Invoke-Api -Label "unknown route returns JSON 404"        -Path "/api/nope"  -Method "GET" -Expect 404
Invoke-Api -Label "malformed JSON body returns JSON 400"  -Path "/api/users" -Json '{"function":' -Expect 400

Write-Host "`n== dispatch guards (no database touched) ==" -ForegroundColor Cyan
Invoke-Api -Label "missing function name rejected"        -Path "/api/users" -Json '{}' -Expect 400
Invoke-Api -Label "__proto__ is not callable"             -Path "/api/users" -Json (New-Body -Fn "__proto__" -Params @()) -Expect 400
Invoke-Api -Label "constructor is not callable"           -Path "/api/users" -Json (New-Body -Fn "constructor" -Params @()) -Expect 400
Invoke-Api -Label "function not on this route rejected"   -Path "/api/pals"  -Json (New-Body -Fn "getFullName" -Params @()) -Expect 400
Invoke-Api -Label "params must be an array"               -Path "/api/pals"  -Json '{"function":"get_pals","params":"nope"}' -Expect 400
Invoke-Api -Label "accept_invite rejects a bad status"    -Path "/api/pals"  -Json (New-Body -Fn "accept_invite" -Params @("a@example.com", "b@example.com", "maybe")) -Expect 500

Write-Host "`n== live database calls ==" -ForegroundColor Cyan
Invoke-Api -Label "addEmail registers a locations row"    -Path "/api/location" -Json (New-Body -Fn "addEmail" -Params @($run)) -Expect 200
Invoke-Api -Label "addEmail twice collides with the PK"   -Path "/api/location" -Json (New-Body -Fn "addEmail" -Params @($run)) -Expect 500
Invoke-Api -Label "ShareLocation stores coordinates"      -Path "/api/location" -Json (New-Body -Fn "ShareLocation" -Params @($run, @{ latitude = -26.2041; longitude = 28.0473 })) -Expect 200
Invoke-Api -Label "StopLiveLocation clears coordinates"   -Path "/api/location" -Json (New-Body -Fn "StopLiveLocation" -Params @($run)) -Expect 200
Invoke-Api -Label "get_invites on an empty inbox"         -Path "/api/pals"     -Json (New-Body -Fn "get_invites" -Params @($run)) -Expect 200
Invoke-Api -Label "getFullName without a users row"       -Path "/api/users"    -Json (New-Body -Fn "getFullName" -Params @($run)) -Expect 500
Invoke-Api -Label "get_pals without a users row"          -Path "/api/pals"     -Json (New-Body -Fn "get_pals" -Params @($run)) -Expect 500
Invoke-Api -Label "send_invite against missing users"     -Path "/api/pals"     -Json (New-Body -Fn "send_invite" -Params @("one@example.com", "two@example.com")) -Expect 500

Write-Host ("`n{0} passed, {1} failed" -f $script:pass, $script:fail) -ForegroundColor Cyan
