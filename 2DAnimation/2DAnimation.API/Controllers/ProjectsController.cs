using _2DAnimation.API.DTOs;
using _2DAnimation.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace _2DAnimation.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController(IProjectService projects) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProjectSummaryDto>>> List(CancellationToken ct)
        => Ok(await projects.ListAsync(ct));

    [HttpPost]
    public async Task<ActionResult<ProjectSummaryDto>> Create(
        [FromBody] CreateProjectRequest request, CancellationToken ct)
    {
        var created = await projects.CreateAsync(request, ct);
        return CreatedAtAction(nameof(List), new { id = created.Id }, created);
    }
}
