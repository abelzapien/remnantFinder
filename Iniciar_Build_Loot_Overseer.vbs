Option Explicit

Dim shell, env, fso, baseDir, dotnetDir, exePath, dllPath, dotnetExe
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

baseDir = fso.GetParentFolderName(WScript.ScriptFullName)
dotnetDir = shell.ExpandEnvironmentStrings("%USERPROFILE%\.dotnet")

If fso.FolderExists(dotnetDir) Then
    Set env = shell.Environment("PROCESS")
    env("DOTNET_ROOT") = dotnetDir
End If

shell.CurrentDirectory = baseDir
exePath = baseDir & "\BuildLootOverseer.Backend\bin\Debug\net10.0-windows\BuildLootOverseer.Backend.exe"
dllPath = baseDir & "\BuildLootOverseer.Backend\bin\Debug\net10.0-windows\BuildLootOverseer.Backend.dll"
dotnetExe = dotnetDir & "\dotnet.exe"

If fso.FileExists(exePath) Then
    ' Ejecutable nativo WinExe (GUI pura, cero consola)
    shell.Run """" & exePath & """", 1, False
ElseIf fso.FileExists(dllPath) Then
    ' Fallback ocultando ventana de consola (estilo 0 = SW_HIDE)
    If Not fso.FileExists(dotnetExe) Then dotnetExe = "dotnet"
    shell.Run """" & dotnetExe & """ """ & dllPath & """", 0, False
Else
    MsgBox "No se encontró el ejecutable compilado en:" & vbCrLf & exePath, vbExclamation, "Remnant 2 Build & Loot Overseer"
End If
