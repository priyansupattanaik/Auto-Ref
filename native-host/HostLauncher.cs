using System;
using System.Diagnostics;
using System.IO;
using System.Threading;

class HostLauncher {
    static string FindNodeExe() {
        string[] candidates = new string[] {
            "node.exe",
            @"C:\Program Files\nodejs\node.exe",
            @"C:\Program Files (x86)\nodejs\node.exe",
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Programs\nodejs\node.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), @"npm\node.exe")
        };
        foreach (var c in candidates) {
            if (File.Exists(c)) return c;
        }
        return "node.exe";
    }

    static int Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string hostJs = Path.Combine(baseDir, "host.js");

        ProcessStartInfo psi = new ProcessStartInfo();
        psi.FileName = FindNodeExe();
        psi.Arguments = "\"" + hostJs + "\"";
        psi.WorkingDirectory = baseDir;
        psi.UseShellExecute = false;
        psi.RedirectStandardInput = true;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.CreateNoWindow = true;

        Process proc;
        try {
            proc = Process.Start(psi);
        } catch (Exception ex) {
            byte[] errBytes = System.Text.Encoding.UTF8.GetBytes("{\"ok\":false,\"error\":\"" + ex.Message.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"}");
            byte[] lenBytes = BitConverter.GetBytes((uint)errBytes.Length);
            Stream stdout = Console.OpenStandardOutput();
            stdout.Write(lenBytes, 0, 4);
            stdout.Write(errBytes, 0, errBytes.Length);
            stdout.Flush();
            return 1;
        }

        Thread inThread = new Thread(() => {
            try {
                Stream inStream = Console.OpenStandardInput();
                Stream procIn = proc.StandardInput.BaseStream;
                byte[] buffer = new byte[8192];
                int read;
                while ((read = inStream.Read(buffer, 0, buffer.Length)) > 0) {
                    procIn.Write(buffer, 0, read);
                    procIn.Flush();
                }
            } catch {}
            finally {
                try { proc.StandardInput.Close(); } catch {}
            }
        });
        inThread.IsBackground = true;
        inThread.Start();

        Thread outThread = new Thread(() => {
            try {
                Stream outStream = Console.OpenStandardOutput();
                Stream procOut = proc.StandardOutput.BaseStream;
                byte[] buffer = new byte[8192];
                int read;
                while ((read = procOut.Read(buffer, 0, buffer.Length)) > 0) {
                    outStream.Write(buffer, 0, read);
                    outStream.Flush();
                }
            } catch {}
        });
        outThread.IsBackground = true;
        outThread.Start();

        proc.WaitForExit();
        outThread.Join(500);
        return proc.ExitCode;
    }
}
