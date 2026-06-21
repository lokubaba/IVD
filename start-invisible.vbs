Dim WshShell, strPath
Set WshShell = CreateObject("WScript.Shell")

' Set path relative to script directory
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptPosition)
WshShell.CurrentDirectory = strPath

' Run node server.js invisibly (0 hides window, False returns immediately)
WshShell.Run "node server.js", 0, False
