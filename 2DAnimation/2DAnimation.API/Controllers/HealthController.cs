using _2DAnimation.API.Data;
using _2DAnimation.API.DTOs;
using Microsoft.AspNetCore.Mvc;

namespace _2DAnimation.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HealthController(AppDbContext db) : ControllerBase
{
    /// <summary>Reports whether the API is up and the SQL Server database is reachable.</summary>
    [HttpGet]
    public async Task<ActionResult<HealthDto>> Get(CancellationToken ct)
    {
        bool dbOk;
        try
        {
            dbOk = await db.Database.CanConnectAsync(ct);
        }
        catch
        {
            dbOk = false;
        }

        return Ok(new HealthDto("ok", dbOk ? "ok" : "unreachable", DateTime.UtcNow));
    }
}
