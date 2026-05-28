import { Request, Response } from 'express';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import Comment from '../../../models/tizzygo/social/Comment';

// Utility to get userId string safely
const getUserId = (req: Request): string => {
  const userId = (req as any).user?.id || (req as any).user?._id;
  if (!userId) throw new Error('Unauthorized: Missing userId');
  return userId.toString();
};

// Format comment without populated user info
const formatComment = (comment: any) => ({
  _id: comment._id,
  postId: comment.postId,
  userId: comment.userId?.toString() || null, // Return userId as string
  content: comment.content,
  createdAt: comment.createdAt,
  likes: comment.likes,
  replies: (comment.replies || []).map((r: any) => ({
    _id: r._id,
    userId: r.userId?.toString() || null, // Return userId as string
    content: r.content,
    createdAt: r.createdAt,
    likes: r.likes,
  })),
});

// ➕ Add Comment
export const addComment = async (req: Request, res: Response) => {
  try {
    const { postId, content } = req.body;
    console.log('Add comment request:', { postId, content });
    const userId = getUserId(req);
    console.log('User adding comment:', userId);
    const comment = await Comment.create({ userId, postId, content, likes: [] });
    console.log('Comment created:', comment);
    res.status(201).json(formatComment(comment));
  } catch (err: any) {
    res.status(500).json({ message: 'Error adding comment', error: err?.message || err });
  }
};


// 💬 Reply to Comment
export const replyToComment = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const { content } = req.body;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: Missing user ID" });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    // ✅ Push subdocument directly (cast to IReply)
    comment.replies.push({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      content,
      likes: [],
      reported: false,
    } as any); // <-- TypeScript shortcut, avoids "create" error

    await comment.save();

    res.status(201).json(formatComment(comment));
  } catch (err: any) {
    console.error("❌ Error replying to comment:", err);
    res
      .status(500)
      .json({
        message: "Error replying to comment",
        error: err?.message || String(err),
      });
  }
};

// ❤️ Like/Unlike Comment (User-specific)
export const toggleCommentLike = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized: Missing user ID" });
    }

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // ✅ Check if user already liked
    const hasLiked = comment.likes.some((id) => id.toString() === userId);

    if (hasLiked) {
      // Remove like
      comment.likes = comment.likes.filter((id) => id.toString() !== userId);
    } else {
      // Add like (convert string → ObjectId)
      comment.likes.push(new Types.ObjectId(userId));
    }

    await comment.save();

    res.status(200).json({
      _id: comment._id,
      likesCount: comment.likes.length,
      likedByCurrentUser: !hasLiked,
    });
  } catch (err: any) {
    console.error("❌ Error toggling comment like:", err);
    res.status(500).json({ message: "Error toggling comment like", error: err?.message || String(err) });
  }
};

// ❤️ Like/Unlike Reply (User-specific)
export const toggleReplyLike = async (req: Request, res: Response) => {
  try {
    const { commentId, replyId } = req.params;
    const userId = getUserId(req);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    const hasLiked = reply.likes.some((id) => id.toString() === userId);
    if (hasLiked) {
      reply.likes = reply.likes.filter((id) => id.toString() !== userId);
    } else {
      // Add like (convert string → ObjectId)
      reply.likes.push(new Types.ObjectId(userId));
    }

    await comment.save();
    res.status(200).json({
      _id: reply._id,
      likesCount: reply.likes.length,
      likedByCurrentUser: !hasLiked,
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Error toggling reply like', error: err?.message || err });
  }
};

// 🧹 Delete Comment (Only Owner)
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;
    const userId = getUserId(req);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.userId.toString() !== userId) {
      return res.status(403).json({ message: 'You can only delete your own comment' });
    }

    await comment.deleteOne();
    res.status(200).json({ message: 'Comment deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error deleting comment', error: err?.message || err });
  }
};

// 🧹 Delete Reply (Only Owner)
export const deleteReply = async (req: Request, res: Response) => {
  try {
    const { commentId, replyId } = req.params;
    const userId = getUserId(req);

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const reply = comment.replies.id(replyId);
    if (!reply) return res.status(404).json({ message: 'Reply not found' });

    if (reply.userId.toString() !== userId) {
      return res.status(403).json({ message: 'You can only delete your own reply' });
    }

    reply.deleteOne();
    await comment.save();

    res.status(200).json({ message: 'Reply deleted' });
  } catch (err: any) {
    res.status(500).json({ message: 'Error deleting reply', error: err?.message || err });
  }
};

// 📦 Get All Comments (by post)
export const getCommentsByPost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    console.log('Fetching comments for postId:', postId);
    const comments = await Comment.find({ postId }).sort({ createdAt: -1 });
    console.log('Fetched comments:', comments);
    res.status(200).json(comments.map(formatComment));
  } catch (err: any) {
    res.status(500).json({ message: 'Error fetching comments', error: err?.message || err });
  }
};

// 📈 Count Stats
export const getCommentStats = async (_req: Request, res: Response) => {
  try {
    const comments = await Comment.find();
    let totalReplies = 0;
    let totalCommentLikes = 0;
    let totalReplyLikes = 0;

    comments.forEach((c) => {
      totalReplies += c.replies.length;
      totalCommentLikes += c.likes.length;
      totalReplyLikes += c.replies.reduce((acc, r) => acc + r.likes.length, 0);
    });

    res.status(200).json({
      totalComments: comments.length,
      totalReplies,
      totalCommentLikes,
      totalReplyLikes,
    });
  } catch (err: any) {
    res.status(500).json({ message: 'Error getting stats', error: err?.message || err });
  }
};

// 📋 Get All Reports
export const getAllReports = async (_req: Request, res: Response) => {
  try {
    const reportedComments = await Comment.find({ reported: true });
    const reportedReplies: any[] = [];

    const allComments = await Comment.find();
    allComments.forEach((comment) => {
      comment.replies.forEach((reply) => {
        if (reply.reported) {
          reportedReplies.push({
            commentId: comment._id,
            reply,
          });
        }
      });
    });

    res.status(200).json({ reportedComments, reportedReplies });
  } catch (err: any) {
    res.status(500).json({ message: 'Error fetching reports', error: err?.message || err });
  }
};

export const getUniqueUserCommentCounts = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const objectPostId = new mongoose.Types.ObjectId(postId);

    const userCommentCounts = await Comment.aggregate([
      { $match: { postId: objectPostId } },  // Match comments of this postId
      {
        $group: {
          _id: '$userId',                    // Group by userId
          commentCount: { $sum: 1 }          // Count comments per user
        }
      },
      {
        $lookup: {
          from: 'users',                     // Join with users collection
          localField: '_id',                 // userId in comments
          foreignField: '_id',               // _id in users
          as: 'userInfo'
        }
      },
      { $unwind: '$userInfo' },              // Flatten userInfo array
      {
        $project: {                          // Return these fields
          _id: 0,
          userId: '$_id',
          userName: '$userInfo.name',
          userImage: '$userInfo.image',
          commentCount: 1
        }
      }
    ]);

    res.status(200).json(userCommentCounts);
  } catch (error: any) {
    res.status(500).json({
      message: 'Error fetching unique user comment counts',
      error: error?.message || error,
    });
  }
};