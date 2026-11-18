using System;
using System.Collections.Concurrent;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using BuildLootOverseer.Backend.Models;
using BuildLootOverseer.Backend.Services;
using lib.remnant2.analyzer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace BuildLootOverseer.Backend;

internal static class Program
{
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetConsoleWindow();

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string? lpClassName, string lpWindowName);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    private const int SW_HIDE = 0;
    private const int SW_SHOW = 5;
    private const int SW_RESTORE = 9;
    private const string MainWindowTitle = "Remnant 2 Build & Loot Overseer";
    private static Form? _activeDesktopForm;

    [STAThread]
    public static int Main(string[] args)
    {
        try
        {
            Console.OutputEncoding = Encoding.UTF8;
        }
        catch
        {
            // No console handle attached when running as native WinExe GUI
        }

        SaveGuardValidator.EnsureAppDirectories();

        if (args.Contains("--verify-save", StringComparer.OrdinalIgnoreCase))
        {
            return RunVerifySaveCliAsync().GetAwaiter().GetResult();
        }

        if (args.Contains("--export-analyzer-db", StringComparer.OrdinalIgnoreCase))
        {
            return RunExportAnalyzerDb();
        }

        bool serverOnly = args.Contains("--server-only", StringComparer.OrdinalIgnoreCase);

        // Ensure single desktop GUI instance so multiple watchers never compete
        Mutex? singleInstanceMutex = null;
        if (!serverOnly)
        {
            singleInstanceMutex = new Mutex(true, @"Local\Remnant2BuildLootOverseer_SingleInstance", out bool createdNew);
            if (!createdNew)
            {
                IntPtr existingHwnd = FindWindow(null, MainWindowTitle);
                if (existingHwnd != IntPtr.Zero)
                {
                    ShowWindow(existingHwnd, SW_RESTORE);
                    SetForegroundWindow(existingHwnd);
                }
                singleInstanceMutex.Dispose();
                return 0;
            }
        }

        int port = 5179;
        int portArgIdx = Array.FindIndex(args, a => a.Equals("--port", StringComparison.OrdinalIgnoreCase));
        if (portArgIdx >= 0 && portArgIdx + 1 < args.Length && int.TryParse(args[portArgIdx + 1], out int parsedPort))
        {
            port = parsedPort;
        }
        else if (!serverOnly)
        {
            port = FindAvailablePort(5179);
        }

        string? devUiUrl = null;
        int uiIdx = Array.FindIndex(args, a => a.Equals("--ui-url", StringComparison.OrdinalIgnoreCase));
        if (uiIdx >= 0 && uiIdx + 1 < args.Length)
        {
            devUiUrl = args[uiIdx + 1];
        }

        Console.WriteLine("[1/5] Inicializando servicios seguros de lectura (.sav) y respaldos...");
        using var snapshotReader = new SafeSnapshotReader();
        var backupService = new BackupService();
        using var analyzerService = new SaveAnalyzerService(snapshotReader, backupService);
        var userStorage = new UserStorageService();

        // Preload initial config & start watching
        Console.WriteLine("[2/5] Cargando configuración de usuario e iniciando FileSystemWatcher...");
        var initialConfig = Task.Run(() => userStorage.LoadConfigAsync()).GetAwaiter().GetResult();
        if (!string.IsNullOrWhiteSpace(initialConfig.CustomSaveFolder) && Directory.Exists(initialConfig.CustomSaveFolder))
        {
            analyzerService.SetCustomSaveFolder(initialConfig.CustomSaveFolder);
        }
        else
        {
            try
            {
                analyzerService.StartWatching();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[Startup] Warning starting watcher: {ex.Message}");
            }
        }

        Console.WriteLine($"[3/5] Iniciando servidor local en http://127.0.0.1:{port}...");
        WebApplication app = BuildWebServer(port, analyzerService, backupService, userStorage);

        if (serverOnly)
        {
            Console.WriteLine($"[Remnant 2 Build & Loot Overseer] Local API server listening on http://127.0.0.1:{port}");
            app.Run($"http://127.0.0.1:{port}");
            return 0;
        }

        app.Urls.Add($"http://127.0.0.1:{port}");
        Task.Run(() => app.StartAsync()).GetAwaiter().GetResult();
        Console.WriteLine($"[4/5] Servidor activo en http://127.0.0.1:{port}. Abriendo ventana de escritorio...");

        ApplicationConfiguration.Initialize();
        string targetUrl = !string.IsNullOrWhiteSpace(devUiUrl) ? devUiUrl : $"http://127.0.0.1:{port}";
        using var mainForm = CreateDesktopWindow(targetUrl);
        _activeDesktopForm = mainForm;
        Application.Run(mainForm);
        _activeDesktopForm = null;

        Task.Run(() => app.StopAsync(TimeSpan.FromSeconds(2))).GetAwaiter().GetResult();
        singleInstanceMutex?.ReleaseMutex();
        singleInstanceMutex?.Dispose();
        return 0;
    }

    private static Form CreateDesktopWindow(string targetUrl)
    {
        var form = new Form
        {
            Text = "Remnant 2 Build & Loot Overseer",
            Width = 1480,
            Height = 920,
            MinimumSize = new Size(1080, 680),
            StartPosition = FormStartPosition.CenterScreen,
            BackColor = Color.FromArgb(13, 15, 20)
        };

        // Load original custom vector-derived application icon
        string[] iconCandidates =
        [
            Path.Combine(AppContext.BaseDirectory, "Assets", "overseer-icon.ico"),
            Path.Combine(AppContext.BaseDirectory, "overseer-icon.ico"),
            Path.Combine(Directory.GetCurrentDirectory(), "BuildLootOverseer.Backend", "Assets", "overseer-icon.ico"),
            @"c:\Users\abelz\Workspace\remnantFinder\BuildLootOverseer.Backend\Assets\overseer-icon.ico"
        ];
        foreach (string iconPath in iconCandidates)
        {
            if (File.Exists(iconPath))
            {
                try
                {
                    form.Icon = new Icon(iconPath);
                    break;
                }
                catch
                {
                    // Ignore icon load failure
                }
            }
        }

        var webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(13, 15, 20)
        };

        form.Controls.Add(webView);

        form.Load += async (_, _) =>
        {
            try
            {
                ShowWindow(form.Handle, SW_SHOW);
                SetForegroundWindow(form.Handle);
                form.Activate();
                Console.WriteLine("[5/5] Inicializando motor WebView2 en ventana nativa...");
                string webViewDataDir = Path.Combine(SaveGuardValidator.TempRoot, "webview2_env");
                SaveGuardValidator.AssertSafeWritePath(webViewDataDir);
                var env = await CoreWebView2Environment.CreateAsync(null, webViewDataDir);
                await webView.EnsureCoreWebView2Async(env);
                webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
                webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                webView.CoreWebView2.NewWindowRequested += (_, e) =>
                {
                    e.Handled = true;
                    OpenSafeExternalUrl(e.Uri);
                };
                webView.CoreWebView2.Navigate(targetUrl);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WebView2 Fallback] {ex.GetType().Name}: {ex.Message}");
                LaunchStandaloneBrowserWindowFallback(targetUrl);
            }
        };

        return form;
    }

    private static void OpenSafeExternalUrl(string? rawUrl)
    {
        if (string.IsNullOrWhiteSpace(rawUrl)) return;
        if (!Uri.TryCreate(rawUrl.Trim(), UriKind.Absolute, out Uri? uri)) return;
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return;

        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = uri.AbsoluteUri,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error opening external URL '{rawUrl}': {ex.Message}");
        }
    }

    private static void LaunchStandaloneBrowserWindowFallback(string targetUrl)
    {
        try
        {
            string[] browserPaths =
            [
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Google\Chrome\Application\chrome.exe"
            ];

            string? browserExe = browserPaths.FirstOrDefault(File.Exists);
            if (browserExe != null)
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = browserExe,
                    Arguments = $"--app={targetUrl} --window-size=1480,920",
                    UseShellExecute = true
                });
            }
            else
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = targetUrl,
                    UseShellExecute = true
                });
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Error launching app window: {ex.Message}");
        }
    }

    private static WebApplication BuildWebServer(
        int port,
        SaveAnalyzerService analyzerService,
        BackupService backupService,
        UserStorageService userStorage)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = AppContext.BaseDirectory
        });
        builder.Logging.ClearProviders();
        builder.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(policy =>
                policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
        });

        var app = builder.Build();
        app.UseCors();

        var jsonOpts = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };

        // SSE Subscribers for instant real-time save updates
        var sseClients = new ConcurrentDictionary<Guid, HttpResponse>();
        analyzerService.OnDatasetUpdated += async updatedDto =>
        {
            string payload = JsonSerializer.Serialize(new { type = "saveUpdated", data = updatedDto }, jsonOpts);
            foreach (var kvp in sseClients)
            {
                try
                {
                    await kvp.Value.WriteAsync($"data: {payload}\n\n");
                    await kvp.Value.Body.FlushAsync();
                }
                catch
                {
                    sseClients.TryRemove(kvp.Key, out _);
                }
            }
        };

        app.MapGet("/api/health", () => Results.Json(new
        {
            status = "ok",
            app = "Remnant 2 Build & Loot Overseer",
            storageRoot = SaveGuardValidator.AppStorageRoot
        }, jsonOpts));

        app.MapGet("/api/save", async (bool? refresh) =>
        {
            try
            {
                var dto = await analyzerService.LoadAndAnalyzeAsync(forceRefresh: refresh == true);
                return Results.Json(dto, jsonOpts);
            }
            catch (Exception ex)
            {
                return Results.Json(new { error = ex.Message }, jsonOpts, statusCode: 500);
            }
        });

        app.MapPost("/api/save/refresh", async () =>
        {
            try
            {
                var dto = await analyzerService.LoadAndAnalyzeAsync(forceRefresh: true);
                return Results.Json(dto, jsonOpts);
            }
            catch (Exception ex)
            {
                return Results.Json(new { error = ex.Message }, jsonOpts, statusCode: 500);
            }
        });

        app.MapGet("/api/backups", () =>
        {
            var list = backupService.ListBackups();
            return Results.Json(list, jsonOpts);
        });

        app.MapPost("/api/backups/create", async () =>
        {
            try
            {
                var dto = await analyzerService.LoadAndAnalyzeAsync(forceRefresh: true, forceManualBackup: true);
                return Results.Json(new
                {
                    backups = backupService.ListBackups(),
                    save = dto
                }, jsonOpts);
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message, statusCode: 500);
            }
        });

        app.MapGet("/api/branding", () =>
        {
            var branding = UserStorageService.LoadBranding();
            return Results.Json(branding, jsonOpts);
        });

        app.MapPost("/api/open-external", async (HttpRequest req) =>
        {
            using var doc = await JsonDocument.ParseAsync(req.Body);
            string? url = doc.RootElement.TryGetProperty("url", out var u) ? u.GetString() : null;
            OpenSafeExternalUrl(url);
            return Results.Json(new { ok = true }, jsonOpts);
        });

        app.MapGet("/api/save/platforms", () =>
        {
            string activeFolder = string.Empty;
            try
            {
                activeFolder = analyzerService.GetActiveSaveFolder();
            }
            catch
            {
                // Ignore if no default save folder exists on this machine yet
            }
            var discovery = SafeSnapshotReader.DiscoverPlatforms(activeFolder);
            return Results.Json(discovery, jsonOpts);
        });

        app.MapPost("/api/save/validate-path", async (HttpRequest req) =>
        {
            using var doc = await JsonDocument.ParseAsync(req.Body);
            string? path = doc.RootElement.TryGetProperty("path", out var p) ? p.GetString() : null;
            var inspection = SafeSnapshotReader.InspectSaveFolder(path);
            return Results.Json(inspection, jsonOpts);
        });

        app.MapPost("/api/save/browse-folder", async (HttpRequest req) =>
        {
            string? initialPath = null;
            try
            {
                using var doc = await JsonDocument.ParseAsync(req.Body);
                if (doc.RootElement.TryGetProperty("initialPath", out var ip))
                {
                    initialPath = ip.GetString();
                }
            }
            catch
            {
                // Optional body
            }

            string? chosenPath = await BrowseFolderDialogAsync(initialPath);
            if (string.IsNullOrWhiteSpace(chosenPath))
            {
                return Results.Json(new { cancelled = true }, jsonOpts);
            }

            var inspection = SafeSnapshotReader.InspectSaveFolder(chosenPath);
            return Results.Json(new
            {
                cancelled = false,
                selectedPath = inspection.NormalizedPath,
                rawSelectedPath = chosenPath,
                inspection
            }, jsonOpts);
        });

        app.MapPost("/api/save/apply-folder", async (HttpRequest req) =>
        {
            using var doc = await JsonDocument.ParseAsync(req.Body);
            string? rawPath = doc.RootElement.TryGetProperty("path", out var p) ? p.GetString() : null;
            string platform = doc.RootElement.TryGetProperty("platform", out var pl) && !string.IsNullOrWhiteSpace(pl.GetString())
                ? pl.GetString()!
                : "Custom";

            var inspection = SafeSnapshotReader.InspectSaveFolder(rawPath);
            if (!inspection.DirectoryExists)
            {
                return Results.Json(new
                {
                    error = $"La carpeta seleccionada no existe: {rawPath}",
                    inspection
                }, jsonOpts, statusCode: 400);
            }

            if (!inspection.IsValid)
            {
                return Results.Json(new
                {
                    error = "No se encontraron archivos profile.sav ni contenedores válidos de Remnant 2 en esa carpeta.",
                    inspection
                }, jsonOpts, statusCode: 400);
            }

            analyzerService.SetCustomSaveFolder(inspection.NormalizedPath);

            var cfg = await userStorage.LoadConfigAsync();
            cfg.SavePlatform = platform;
            cfg.CustomSaveFolder = inspection.NormalizedPath;
            cfg.HasCompletedSetup = true;
            var savedCfg = await userStorage.SaveConfigAsync(cfg);

            var dto = await analyzerService.LoadAndAnalyzeAsync(forceRefresh: true);
            return Results.Json(new
            {
                config = savedCfg,
                save = dto,
                inspection
            }, jsonOpts);
        });

        app.MapGet("/api/config", async () =>
        {
            var cfg = await userStorage.LoadConfigAsync();
            return Results.Json(cfg, jsonOpts);
        });

        app.MapPost("/api/config", async (HttpRequest req) =>
        {
            var body = await JsonSerializer.DeserializeAsync<UserAppConfigDto>(req.Body, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            if (body == null) return Results.BadRequest("Invalid config payload");
            var saved = await userStorage.SaveConfigAsync(body);
            return Results.Json(saved, jsonOpts);
        });

        app.MapGet("/api/catalog", async () =>
        {
            string? catalogPath = FindCatalogJsonPath();
            if (catalogPath == null || !File.Exists(catalogPath))
            {
                return Results.NotFound(new { error = "Catalog file catalog.merged.json not found." });
            }
            string content = await File.ReadAllTextAsync(catalogPath);
            return Results.Content(content, "application/json; charset=utf-8");
        });

        app.MapGet("/api/events", async (HttpContext ctx) =>
        {
            ctx.Response.Headers.Append("Content-Type", "text/event-stream");
            ctx.Response.Headers.Append("Cache-Control", "no-cache");
            ctx.Response.Headers.Append("Connection", "keep-alive");

            Guid id = Guid.NewGuid();
            sseClients[id] = ctx.Response;

            try
            {
                await ctx.Response.WriteAsync($"data: {{\"type\":\"connected\",\"clientId\":\"{id}\"}}\n\n");
                await ctx.Response.Body.FlushAsync();
                while (!ctx.RequestAborted.IsCancellationRequested)
                {
                    await Task.Delay(15000, ctx.RequestAborted);
                    await ctx.Response.WriteAsync(": keepalive\n\n");
                    await ctx.Response.Body.FlushAsync();
                }
            }
            catch (OperationCanceledException)
            {
                // Normal disconnect
            }
            finally
            {
                sseClients.TryRemove(id, out _);
            }
        });

        // Serve static frontend files if built in wwwroot or Frontend/dist
        string? staticRoot = FindFrontendDistPath();
        if (staticRoot != null && Directory.Exists(staticRoot))
        {
            var provider = new PhysicalFileProvider(staticRoot);
            app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
            app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
            app.MapFallback(async ctx =>
            {
                string indexFile = Path.Combine(staticRoot, "index.html");
                if (File.Exists(indexFile))
                {
                    ctx.Response.ContentType = "text/html; charset=utf-8";
                    await ctx.Response.SendFileAsync(indexFile);
                }
                else
                {
                    ctx.Response.StatusCode = 404;
                }
            });
        }

        return app;
    }

    private static Task<string?> BrowseFolderDialogAsync(string? initialPath)
    {
        var tcs = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);

        string? RunPicker(IWin32Window? owner)
        {
            using var dialog = new FolderBrowserDialog
            {
                Description = "Selecciona la carpeta de guardados de Remnant 2 / Select Remnant 2 save folder",
                UseDescriptionForTitle = true,
                ShowNewFolderButton = false
            };

            if (!string.IsNullOrWhiteSpace(initialPath))
            {
                string expanded = Environment.ExpandEnvironmentVariables(initialPath.Trim());
                if (Directory.Exists(expanded))
                {
                    dialog.InitialDirectory = expanded;
                    dialog.SelectedPath = expanded;
                }
                else
                {
                    string? parent = Path.GetDirectoryName(expanded);
                    if (!string.IsNullOrWhiteSpace(parent) && Directory.Exists(parent))
                    {
                        dialog.InitialDirectory = parent;
                        dialog.SelectedPath = parent;
                    }
                }
            }

            DialogResult result = owner != null ? dialog.ShowDialog(owner) : dialog.ShowDialog();
            return result == DialogResult.OK ? dialog.SelectedPath : null;
        }

        Form? hostForm = _activeDesktopForm;
        if (hostForm is { IsDisposed: false, IsHandleCreated: true })
        {
            hostForm.BeginInvoke(new Action(() =>
            {
                try
                {
                    tcs.TrySetResult(RunPicker(hostForm));
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            }));
        }
        else
        {
            var staThread = new Thread(() =>
            {
                try
                {
                    tcs.TrySetResult(RunPicker(null));
                }
                catch (Exception ex)
                {
                    tcs.TrySetException(ex);
                }
            });
            staThread.SetApartmentState(ApartmentState.STA);
            staThread.IsBackground = true;
            staThread.Start();
        }

        return tcs.Task;
    }

    private static string? FindCatalogJsonPath()
    {
        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "catalog.merged.json"),
            Path.Combine(AppContext.BaseDirectory, "data", "catalog.merged.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "data", "catalog.merged.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "data", "catalog.merged.json"),
            @"c:\Users\abelz\Workspace\remnantFinder\data\catalog.merged.json"
        ];
        return candidates.FirstOrDefault(File.Exists);
    }

    private static string? FindFrontendDistPath()
    {
        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "wwwroot"),
            Path.Combine(Directory.GetCurrentDirectory(), "BuildLootOverseer.Frontend", "dist"),
            Path.Combine(Directory.GetCurrentDirectory(), "..", "BuildLootOverseer.Frontend", "dist"),
            @"c:\Users\abelz\Workspace\remnantFinder\BuildLootOverseer.Frontend\dist"
        ];
        return candidates.FirstOrDefault(Directory.Exists);
    }

    private static int FindAvailablePort(int preferredPort)
    {
        try
        {
            using var listener = new TcpListener(IPAddress.Loopback, preferredPort);
            listener.Start();
            listener.Stop();
            return preferredPort;
        }
        catch
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0);
            listener.Start();
            int port = ((IPEndPoint)listener.LocalEndpoint).Port;
            listener.Stop();
            return port;
        }
    }

    private static int RunExportAnalyzerDb()
    {
        string outDir = @"c:\Users\abelz\Workspace\remnantFinder\data";
        Directory.CreateDirectory(outDir);
        string outPath = Path.Combine(outDir, "analyzer_db_raw.json");
        string json = JsonSerializer.Serialize(ItemDb.Db, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(outPath, json, Encoding.UTF8);
        Console.WriteLine($"Exported {ItemDb.Db.Count} records from lib.remnant2.analyzer.ItemDb.Db to {outPath}");
        return 0;
    }

    private static async Task<int> RunVerifySaveCliAsync()
    {
        Console.WriteLine("================================================================================");
        Console.WriteLine(" REMNANT 2 BUILD & LOOT OVERSEER - FASE 1: VERIFICACIÓN DE LECTURA SEGURA (.SAV)");
        Console.WriteLine("================================================================================");

        string saveFolder = SafeSnapshotReader.ResolveDefaultSaveFolder();
        Console.WriteLine($"[1] Carpeta de guardados detectada : {saveFolder}");
        Console.WriteLine($"[2] Almacenamiento aislado de App  : {SaveGuardValidator.AppStorageRoot}");
        Console.WriteLine($"[3] Directorio de copia temporal   : {SaveGuardValidator.TempRoot}");
        Console.WriteLine($"[4] Directorio de respaldos (.zip) : {SaveGuardValidator.BackupsRoot}");

        // Record original file states BEFORE reading
        var beforeFiles = Directory.GetFiles(saveFolder)
            .Select(f => new FileInfo(f))
            .ToDictionary(f => f.FullName, f => (f.Length, f.LastWriteTimeUtc), StringComparer.OrdinalIgnoreCase);

        // Verify SaveGuardValidator blocks writes to the game save folder
        bool guardBlockedWrite = false;
        try
        {
            SaveGuardValidator.AssertSafeWritePath(Path.Combine(saveFolder, "test_forbidden.tmp"), saveFolder);
        }
        catch (UnauthorizedAccessException)
        {
            guardBlockedWrite = true;
        }
        Console.WriteLine($"[5] Prueba SaveGuardValidator (Bloqueo de escritura en carpeta de juego): {(guardBlockedWrite ? "PASSED (Escritura bloqueada)" : "FAILED")}");
        if (!guardBlockedWrite) return 1;

        using var snapshotReader = new SafeSnapshotReader();
        var backupService = new BackupService();
        using var analyzerService = new SaveAnalyzerService(snapshotReader, backupService);

        SaveDatasetDto? dto = await analyzerService.LoadAndAnalyzeAsync(forceRefresh: true, forceManualBackup: false);
        if (dto == null)
        {
            Console.Error.WriteLine("[ERROR] No se pudo parsear el dataset de guardado.");
            return 1;
        }

        // Record original file states AFTER reading & verify zero modification
        var afterFiles = Directory.GetFiles(saveFolder)
            .Select(f => new FileInfo(f))
            .ToDictionary(f => f.FullName, f => (f.Length, f.LastWriteTimeUtc), StringComparer.OrdinalIgnoreCase);

        bool zeroModificationVerified = beforeFiles.Count == afterFiles.Count &&
            beforeFiles.All(kvp => afterFiles.TryGetValue(kvp.Key, out var afterVal)
                                   && afterVal.Length == kvp.Value.Length
                                   && afterVal.LastWriteTimeUtc == kvp.Value.LastWriteTimeUtc);

        Console.WriteLine($"[6] Verificación CERO ESCRITURA (timestamps/tamaños intactos en carpeta Steam): {(zeroModificationVerified ? "PASSED (100% Intacto)" : "FAILED")}");
        Console.WriteLine($"[7] Tiempo de copia no bloqueante a RAM/temp : {dto.CopyDurationMs} ms");
        Console.WriteLine($"[8] Tiempo de desencriptado Zlib + CRC32 + UE5: {dto.ParseDurationMs} ms");
        Console.WriteLine($"[9] Build del juego en profile.sav            : {dto.GameBuildNumber}");
        Console.WriteLine($"[10] Hash SHA-256 del Snapshot                : {dto.CombinedSha256}");

        Console.WriteLine("\n--- ARCHIVOS COPIADOS A TEMP ---");
        foreach (var f in dto.SnapshotFiles)
        {
            Console.WriteLine($"  • {f.FileName,-14} | {f.SizeBytes,9:N0} bytes | Temp: {f.TempPath}");
        }

        Console.WriteLine($"\n--- HISTORIAL DE RESPALDOS PREVENTIVOS (.ZIP, MÁX {BackupService.MaxRotatingBackups}) ---");
        foreach (var b in dto.Backups)
        {
            Console.WriteLine($"  • {b.FileName} | {b.SizeBytes,9:N0} bytes | Motivo: {b.Reason} | Ruta: {b.FullPath}");
        }

        Console.WriteLine($"\n--- PREMIOS DE CUENTA DESBLOQUEADOS ({dto.AccountAwards.Count}) ---");
        foreach (var award in dto.AccountAwards.Take(10))
        {
            Console.WriteLine($"  • {award.NameEs} ({award.Name}) [{award.Id}]");
        }
        if (dto.AccountAwards.Count > 10)
        {
            Console.WriteLine($"  ... y {dto.AccountAwards.Count - 10} más.");
        }

        Console.WriteLine($"\n--- PERSONAJES DETECTADOS ({dto.Characters.Count}) ---");
        foreach (var c in dto.Characters)
        {
            bool isActive = c.ListIndex == dto.ActiveCharacterListIndex;
            Console.WriteLine($"\n================================================================================");
            Console.WriteLine($" {(isActive ? "★ [PERSONAJE ACTIVO]" : "  [PERSONAJE]")} Slot save_{c.SaveSlotIndex}.sav: {c.Summary}");
            Console.WriteLine($"================================================================================");
            Console.WriteLine($"  • Arquetipos        : {c.PrimaryArchetypeEs} ({c.PrimaryArchetype}) / {c.SecondaryArchetypeEs ?? "Ninguno"} ({c.SecondaryArchetype ?? "None"})");
            Console.WriteLine($"  • Nivel de Poder    : {c.PowerLevel} (Nivel de Ítem: {c.ItemLevel}) | Rasgos: Rango {c.TraitRank}");
            Console.WriteLine($"  • Modo Hardcore     : {(c.IsHardcore ? "Sí" : "No")} | Tiempo jugado: {c.PlaytimeFormatted}");
            Console.WriteLine($"  • Modo Activo Actual: {c.ActiveWorldSlot}");
            Console.WriteLine($"  • Inventario Global : {c.AcquiredItemsCount} obtenidos / {c.MissingItemsCount} faltantes (Total rastreables: {c.TotalTrackableItemsCount})");
            Console.WriteLine($"  • Materiales listos : {c.HasRequiredMaterialItemIds.Count} ítems pendientes cuyo material ya posees");
            Console.WriteLine($"  • Tienda de Cass    : {c.CassShop.Count} ítems en stock ({c.CassShop.Count(x => !x.IsOwned)} nuevos por comprar)");

            Console.WriteLine("\n  [EQUIPAMIENTO ACTUALMENTE EQUIPADO]");
            foreach (var eq in c.EquippedItems.Where(e => e.Slot != "Trait"))
            {
                string lvl = eq.Level > 0 ? $" +{eq.Level}" : "";
                Console.WriteLine($"    - {eq.Slot,-14}: {eq.NameEs} ({eq.Name}){lvl} [{eq.Type}]");
            }

            PrintWorldSummary(c.Campaign);
            if (c.Adventure != null)
            {
                PrintWorldSummary(c.Adventure);
            }
            else
            {
                Console.WriteLine("\n  [MODO AVENTURA]: Sin aventura activa generada.");
            }
        }

        Console.WriteLine("\n================================================================================");
        Console.WriteLine(" VERIFICACIÓN DE FASE 1 COMPLETADA CON ÉXITO.");
        Console.WriteLine("================================================================================");
        return 0;
    }

    private static void PrintWorldSummary(RolledWorldDto w)
    {
        Console.WriteLine($"\n  [MUNDO GENERADO: {w.Mode.ToUpperInvariant()} | Dificultad: {w.Difficulty} | Tiempo: {w.PlaytimeFormatted}]");
        Console.WriteLine($"    📍 UBICACIÓN ACTUAL DEL JUGADOR : {w.CurrentWorldNameEs ?? "?"} -> {w.CurrentLocationNameEs ?? "Desconocida"} ({w.RespawnPointFormatted ?? "Sin punto"})");
        Console.WriteLine($"    🗺️ PROGRESO DE MAZMORRAS/ZONAS  : {w.VisitedLocationsCount} Visitadas / {w.PendingLocationsCount} Pendientes por descubrir (Total: {w.TotalLocationsCount})");

        foreach (var z in w.Zones)
        {
            string hereTag = z.IsPlayerHere ? " 👈 [MUNDO ACTUAL]" : "";
            Console.WriteLine($"\n    ▸ Mundo: {z.NameEs} ({z.Name}) | Historia: {z.StoryEs} ({z.Story}) | Zonas: {z.VisitedLocations}/{z.TotalLocations} visitadas{hereTag}");
            foreach (var loc in z.Locations)
            {
                string statusIcon = loc.ExplorationStatus switch
                {
                    "Current" => "📍 [ESTÁS AQUÍ]",
                    "Visited" => "👣 [VISITADA]  ",
                    _ => "🔒 [PENDIENTE] "
                };
                int missingHere = loc.Items.Count(i => !i.IsOwned && !i.IsLootedInWorld);
                int totalHere = loc.Items.Count;
                string extras = "";
                if (loc.IsTraitBookPresent) extras += loc.IsTraitBookLooted ? " [Libro Rasgo: Recogido]" : " [📘 Libro Rasgo Disponible]";
                if (loc.IsSimulacrumPresent) extras += loc.IsSimulacrumLooted ? " [Simulacro: Recogido]" : " [💎 Simulacro Disponible]";

                Console.WriteLine($"       {statusIcon} [#{loc.RouteOrder} | {loc.ZoneRole}] {loc.NameEs,-26} ({loc.Name.Trim(),-24}) | Coords 3D: {loc.VisitedCoordinatesCount,4} | Ítems nuevos: {missingHere,2}/{totalHere,2}{extras}");
                string parentDesc = loc.ParentLocationNameEs != null
                    ? $"Entrada en: {loc.ParentLocationNameEs} ({(loc.IsMainPathEntrance ? "Cuadrada/Principal" : "Arqueada/Opcional")})"
                    : (loc.OverworldIndex > 0 ? $"Zona Exterior {loc.OverworldIndex}" : "Raíz / Compartida");
                string doorsDesc = loc.DoorLinks.Count > 0
                    ? string.Join(", ", loc.DoorLinks.Select(d =>
                        $"{d.TargetLocationNameEs}{(d.DoorCount > 1 ? $" x{d.DoorCount}" : "")} [{(d.IsExitToParent ? "↩Padre/" : "")}{(d.IsMainPath ? "Cuadrada" : "Arqueada")}{(d.IsUsed ? ",✓Cruzada" : ",SinCruzar")}]"))
                    : "Sin puertas directas";
                Console.WriteLine($"                       ↳ {parentDesc} | Grupo: {loc.RouteGroupLabelEs} | Puertas: {doorsDesc}");
            }
        }
    }
}
