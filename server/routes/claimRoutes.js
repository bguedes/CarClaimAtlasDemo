import express from 'express';
import {
  createClaim,
  getSimilarClaims,
  findClaim,
  submitClaim,
  getUnhandledClaims,
  updateClaim
} from '../controllers/claimController.js';

const router = express.Router();

router.route('/createClaim').post(createClaim);
router.route('/similarClaims').post(getSimilarClaims);
router.route('/findClaim').post(findClaim);
router.route('/submitClaim').post(submitClaim);
router.route('/getUnhandledClaims').get(getUnhandledClaims);
router.route('/updateClaim').put(updateClaim);

export default router;
