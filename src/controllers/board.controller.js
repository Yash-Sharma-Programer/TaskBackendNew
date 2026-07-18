import { Board, Column, Task, Project } from '../models/index.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { success } from '../utils/response.js';

export const getByProject = asyncHandler(async (req, res) => {
  const project = await Project.findOne({ _id: req.params.projectId, organisationId: req.organisationId });
  if (!project) throw new AppError('Project not found', 404);
  const board = await Board.findOne({ projectId: project._id, organisationId: req.organisationId });
  if (!board) throw new AppError('Board not found', 404);
  const [columns, tasks] = await Promise.all([
    Column.find({ boardId: board._id, organisationId: req.organisationId }).sort('position'),
    Task.find({ boardId: board._id, organisationId: req.organisationId }).populate('assignees reporter', 'fullName username avatar').sort('position')
  ]);
  success(res, 'Board loaded', { board, columns, tasks });
});

export const createColumn = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, organisationId: req.organisationId }); if (!board) throw new AppError('Board not found', 404);
  const position = await Column.countDocuments({ boardId: board._id });
  const column = await Column.create({ organisationId: req.organisationId, projectId: board.projectId, boardId: board._id, name: req.body.name, color: req.body.color, position, isCompleted: Boolean(req.body.isCompleted) });
  req.io?.to(`project:${board.projectId}`).emit('column:created', column); success(res, 'Column created successfully', { column }, 201);
});
export const updateColumn = asyncHandler(async (req, res) => { const column = await Column.findOneAndUpdate({ _id: req.params.columnId, organisationId: req.organisationId }, { $set: { ...(req.body.name !== undefined && { name: req.body.name }), ...(req.body.color !== undefined && { color: req.body.color }), ...(req.body.isCompleted !== undefined && { isCompleted: req.body.isCompleted }) } }, { new: true, runValidators: true }); if (!column) throw new AppError('Column not found', 404); req.io?.to(`project:${column.projectId}`).emit('column:updated', column); success(res, 'Column updated', { column }); });
export const reorderColumns = asyncHandler(async (req, res) => {
  const board = await Board.findOne({ _id: req.params.boardId, organisationId: req.organisationId }); if (!board) throw new AppError('Board not found', 404);
  await Promise.all(req.body.columnIds.map((id, position) => Column.updateOne({ _id: id, boardId: board._id, organisationId: req.organisationId }, { position })));
  const columns = await Column.find({ boardId: board._id }).sort('position'); req.io?.to(`project:${board.projectId}`).emit('columns:reordered', columns); success(res, 'Columns reordered', { columns });
});
export const deleteColumn = asyncHandler(async (req, res) => { const column = await Column.findOne({ _id: req.params.columnId, organisationId: req.organisationId }); if (!column) throw new AppError('Column not found', 404); if (await Task.exists({ columnId: column._id })) throw new AppError('Only empty columns can be deleted', 409); await column.deleteOne(); await Column.updateMany({ boardId: column.boardId, position: { $gt: column.position } }, { $inc: { position: -1 } }); req.io?.to(`project:${column.projectId}`).emit('column:deleted', { id: column._id }); success(res, 'Column deleted'); });
