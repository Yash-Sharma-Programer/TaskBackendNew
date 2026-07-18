import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { User, Organisation, OrganisationMember, Workspace, WorkspaceMember, Project, Board, Column, Task, Comment, Message, Activity, Notification, Invitation, File, Subscription } from '../models/index.js';

await connectDatabase();
const collections = [Comment, Message, Activity, Notification, Invitation, File, Task, Column, Board, Project, WorkspaceMember, Workspace, OrganisationMember, Subscription, Organisation, User];
await Promise.all(collections.map((item) => item.deleteMany({})));
const passwordHash = await bcrypt.hash('Demo@123', 12);
const people = [
  ['Avery Stone','avery.stone','owner@taskflow.demo','Product Director'],
  ['Jordan Lee','jordan.lee','admin@taskflow.demo','Design Lead'],
  ['Morgan Chen','morgan.chen','manager@taskflow.demo','Engineering Manager'],
  ['Riley Patel','riley.patel','member1@taskflow.demo','Frontend Engineer'],
  ['Casey Brown','casey.brown','member2@taskflow.demo','QA Engineer']
];
const users = await User.insertMany(people.map(([fullName,username,email,jobTitle]) => ({ fullName, username, email, jobTitle, passwordHash, bio: `Demo ${jobTitle.toLowerCase()} account for TaskFlow.`, lastActiveAt: new Date(Date.now() - Math.random() * 3600000) })));
const organisation = await Organisation.create({ name: 'Northstar Studio', slug: 'northstar-studio', description: 'Demo product delivery organisation', owner: users[0]._id, settings: { timezone: 'Asia/Kolkata' } });
const roles = ['owner','admin','manager','member','member'];
await OrganisationMember.insertMany(users.map((u,i) => ({ organisationId: organisation._id, userId: u._id, role: roles[i] })));
await Subscription.create({ organisationId: organisation._id, plan: 'pro', seats: 25, renewsAt: new Date(Date.now() + 30 * 86400000) });
const workspace = await Workspace.create({ organisationId: organisation._id, name: 'Product & Engineering', description: 'Roadmap and delivery workspace', timezone: 'Asia/Kolkata' });
await WorkspaceMember.insertMany(users.map((u) => ({ organisationId: organisation._id, workspaceId: workspace._id, userId: u._id })));
const projectSpecs = [
  ['Mobile App Refresh','#FF745F','Rebuild the customer mobile experience'],
  ['Analytics Platform','#7C5CFC','Reliable self-serve product analytics'],
  ['Customer Portal','#3FB27F','A faster support and account portal']
];
const projects = [];
for (let i=0;i<projectSpecs.length;i++) {
  const [name,color,description] = projectSpecs[i];
  const project = await Project.create({ organisationId: organisation._id, workspaceId: workspace._id, name, color, description, status: 'active', startDate: new Date(Date.now() - (12-i*2)*86400000), deadline: new Date(Date.now() + (18+i*10)*86400000), manager: users[2]._id, teamMembers: users.slice(1).map((u)=>u._id), completionPercentage: 30+i*15 });
  const board = await Board.create({ organisationId: organisation._id, workspaceId: workspace._id, projectId: project._id, name: `${name} board` });
  const columns = await Column.insertMany(['To Do','In Progress','Code Review','Completed'].map((columnName,position)=>({ organisationId: organisation._id, boardId: board._id, projectId: project._id, name: columnName, position, isCompleted: position===3, color: ['#75667D','#F5A742','#7C5CFC','#3FB27F'][position] })));
  projects.push({ project, board, columns });
}
const titles = ['Map onboarding journey','Create navigation system','Build authentication screens','Design empty states','Implement profile API','Add responsive sidebar','Write unit tests','Optimise dashboard queries','Create notification centre','Review accessibility','Add file validation','Implement task filters','Polish loading states','Document API routes','Test mobile board','Create weekly chart','Fix date handling','Review permissions','Prepare release notes','Run final QA'];
const tasks = [];
for (let i=0;i<titles.length;i++) {
  const group = projects[i%projects.length], column = group.columns[i%4];
  tasks.push(await Task.create({ organisationId: organisation._id, workspaceId: workspace._id, projectId: group.project._id, boardId: group.board._id, columnId: column._id, title: titles[i], description: `Seeded demonstration task: ${titles[i]}.`, taskNumber: i+1, priority: ['low','medium','high','urgent'][i%4], labels: [{ name: i%2?'frontend':'platform', color: i%2?'#FF745F':'#7C5CFC' }], assignees: [users[3+i%2]._id], reporter: users[2]._id, startDate: new Date(Date.now() - (i%5)*86400000), deadline: new Date(Date.now() + (i-5)*86400000), estimatedHours: 2+(i%8), position: Math.floor(i/4), completedAt: column.isCompleted?new Date(Date.now()-(i%3)*86400000):null, checklist: [{ text: 'Confirm acceptance criteria', completed: i%2===0 }, { text: 'Add test coverage', completed: i%3===0 }], subtasks: [{ title: 'Peer review', completed: i%4===3 }] }));
}
await Comment.insertMany(tasks.slice(0,8).map((task,i)=>({ organisationId: organisation._id, projectId: task.projectId, taskId: task._id, author: users[(i+1)%users.length]._id, body: i%2?`Looks good. @${users[2].username} can you review the scope?`:'I added the latest progress and acceptance notes.', mentions: i%2?[users[2]._id]:[] })));
await Notification.insertMany(tasks.slice(0,10).map((task,i)=>({ organisationId: organisation._id, userId: users[3+i%2]._id, type: 'assignment', title: 'Task assigned', message: task.title, entityType: 'task', entityId: task._id, link: `/projects/${task.projectId}/board?task=${task._id}`, readAt: i%3===0?new Date():null })));
await Activity.insertMany(tasks.slice(0,15).map((task,i)=>({ organisationId: organisation._id, workspaceId: workspace._id, projectId: task.projectId, taskId: task._id, actor: users[i%users.length]._id, action: i%3===0?'moved task':i%3===1?'updated task':'commented on task', entityType: 'task', entityId: task._id, details: { seeded: true } })));
console.log('TaskFlow demo data created.');
console.log('Owner: owner@taskflow.demo / Demo@123');
console.log('Admin: admin@taskflow.demo / Demo@123');
console.log('Manager: manager@taskflow.demo / Demo@123');
console.log('Members: member1@taskflow.demo and member2@taskflow.demo / Demo@123');
await disconnectDatabase();
