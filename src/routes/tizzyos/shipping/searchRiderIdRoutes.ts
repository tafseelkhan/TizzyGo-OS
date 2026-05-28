import express from 'express';
import { getRiderIdFromToken } from '../../../controller/tizzyos/shipping/searchRiderIdController';

const router = express.Router();

router.get('/rider/get-rider-id', getRiderIdFromToken);

export default router;
