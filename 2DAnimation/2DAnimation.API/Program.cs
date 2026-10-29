using _2DAnimation.API.Configuration;
using _2DAnimation.API.Data;
using _2DAnimation.API.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var connectionString = builder.Configuration.GetConnectionString("StudioDb")
    ?? throw new InvalidOperationException("Connection string 'StudioDb' is missing from configuration.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlServer(connectionString));
builder.Services.AddScoped<IProjectService, ProjectService>();
builder.Services.AddSingleton<IProjectFileStore, ProjectFileStore>();

var app = builder.Build();

app.UseExceptionHandler();

// Local-only tool: no HTTPS redirect, no authentication. The API is bound to
// localhost via launchSettings.json and AllowedHosts in appsettings.json.
app.MapControllers();

// In Development, create/upgrade the local database automatically.
// A failure here is logged but does not stop the API, so /api/health can report it.
if (app.Environment.IsDevelopment())
{
    try
    {
        using var scope = app.Services.CreateScope();
        scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.Migrate();
    }
    catch (Exception ex)
    {
        app.Logger.LogError(ex, "Database migration failed. Check the 'StudioDb' connection string and that SQL Server is running.");
    }
}

app.Run();
