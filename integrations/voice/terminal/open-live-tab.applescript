on run argv
    set nodePath to item 1 of argv
    set followerPath to item 2 of argv
    set statePath to item 3 of argv
    set workspacePath to item 4 of argv
    set launchCommand to followerCommand(nodePath, followerPath, statePath)

    tell application "Ghostty"
        set cfg to new surface configuration
        set initial working directory of cfg to workspacePath
        set command of cfg to launchCommand
        set wait after command of cfg to false
        if (count of windows) is 0 then
            set win to new window with configuration cfg
            set liveTab to selected tab of win
        else
            set liveTab to new tab in front window with configuration cfg
        end if
        perform action "set_tab_title:OpenCode · Voice" on focused terminal of liveTab
        return id of liveTab
    end tell
end run

on followerCommand(nodePath, followerPath, statePath)
    -- Surface configuration commands are already shell commands; no shell: prefix.
    return "exec " & quoted form of nodePath & " " & quoted form of followerPath & " " & quoted form of statePath
end followerCommand
