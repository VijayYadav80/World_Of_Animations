using _2DAnimation.API.DTOs;
using _2DAnimation.API.Services;
using Microsoft.AspNetCore.Mvc;

namespace _2DAnimation.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProjectsController(IProjectService projects, IProjectFileStore files) : ControllerBase
{
    private const long MaxAudioBytes = 100L * 1024 * 1024;

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ProjectSummaryDto>>> List(CancellationToken ct)
        => Ok(await projects.ListAsync(ct));

    [HttpPost]
    public async Task<ActionResult<ProjectSummaryDto>> Create(
        [FromBody] CreateProjectRequest request, CancellationToken ct)
    {
        var created = await projects.CreateAsync(request, ct);
        return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<ProjectDetailDto>> Get(Guid id, CancellationToken ct)
    {
        var project = await projects.GetAsync(id, ct);
        return project is null ? NotFound() : Ok(project);
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<ProjectSummaryDto>> Save(
        Guid id, [FromBody] SaveProjectRequest request, CancellationToken ct)
    {
        try
        {
            var saved = await projects.SaveAsync(id, request, ct);
            return saved is null ? NotFound() : Ok(saved);
        }
        catch (System.Text.Json.JsonException)
        {
            return BadRequest(new ProblemDetails { Title = "SceneJson is not valid JSON." });
        }
    }

    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        => await projects.DeleteAsync(id, ct) ? NoContent() : NotFound();

    /// <summary>Stores one imported audio file (raw bytes in the request body).</summary>
    [HttpPut("{id:guid}/audio/{assetId}")]
    [RequestSizeLimit(MaxAudioBytes)]
    public async Task<IActionResult> UploadAudio(Guid id, string assetId, CancellationToken ct)
    {
        if (!files.IsValidAssetId(assetId)) return BadRequest(new ProblemDetails { Title = "Invalid audio id." });
        if (!await projects.ExistsAsync(id, ct)) return NotFound();

        await files.SaveAudioAsync(id, assetId, Request.Body, ct);
        return NoContent();
    }

    [HttpGet("{id:guid}/audio/{assetId}")]
    public IActionResult DownloadAudio(Guid id, string assetId)
    {
        var stream = files.OpenAudio(id, assetId);
        return stream is null ? NotFound() : File(stream, "application/octet-stream");
    }
}
