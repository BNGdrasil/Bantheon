import React from 'react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@/utils/constants';
import { HomeIcon } from '@heroicons/react/24/outline';

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-gray-300">404</h1>
        </div>
        
        <h2 className="text-3xl font-bold text-gray-900 mb-4">
          페이지를 찾을 수 없습니다
        </h2>
        
        <p className="text-lg text-gray-600 mb-8 max-w-md mx-auto">
          요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        </p>
        
        <div className="space-y-4">
          <Link
            to={ROUTES.HOME}
            className="btn-primary inline-flex items-center"
          >
            <HomeIcon className="h-5 w-5 mr-2" />
            홈으로 돌아가기
          </Link>
          
          <div className="text-sm text-gray-500">
            <p>또는 다음 페이지들을 확인해보세요:</p>
            <div className="mt-2 space-x-4">
              <Link to={ROUTES.PORTFOLIO} className="text-blue-600 hover:underline">
                포트폴리오
              </Link>
              <a href={`https://playground.bnbong.xyz`} className="text-blue-600 hover:underline">
                게임
              </a>
            </div>
          </div>
        </div>
        
        <div className="mt-12">
          <div className="inline-flex items-center space-x-2 text-gray-400">
            <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BNG</span>
            </div>
            <span className="font-semibold">BNGdrasil</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
